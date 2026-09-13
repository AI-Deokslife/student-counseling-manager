import { describe, expect, it } from "vitest";
import worker from "../worker";
import type { D1DatabaseBinding, Env } from "../worker/types";

function createEnv(databaseAvailable = true): Env {
  const statement = {
    bind: () => statement,
    first: async () => {
      if (!databaseAvailable) throw new Error("database unavailable");
      return { health: 1 };
    },
  };

  return {
    DB: {
      prepare: () => statement,
    } as unknown as D1DatabaseBinding,
    ASSETS: {
      fetch: async () => new Response("asset"),
    },
    APP_ENV: "local",
    APP_VERSION: "0.1.0",
  } as Env;
}

describe("GET /api/v1/health", () => {
  it("returns the application and database status", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/v1/health"),
      createEnv(),
    );
    const body = (await response.json()) as {
      data: {
        status: string;
        appVersion: string;
        database: string;
        environment: string;
      };
      meta: { requestId: string };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe(body.meta.requestId);
    expect(body.data).toEqual({
      status: "ok",
      appVersion: "0.1.0",
      database: "ok",
      environment: "local",
    });
  });

  it("reports an unavailable database without exposing the error", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/v1/health"),
      createEnv(false),
    );
    const body = (await response.json()) as { data: { database: string } };

    expect(response.status).toBe(503);
    expect(body.data.database).toBe("unavailable");
  });
});

describe("GET /api/v1/counseling-types", () => {
  it("returns active workspace counseling types in display order", async () => {
    const membership = {
      email: "teacher@example.com",
      display_name: "김선생",
      role: "teacher",
      workspace_id: "1429c877-c06c-498d-a28e-296610483a4a",
      workspace_name: "마음잇기",
    };
    const rows = [
      { id: "type-1", name: "학교생활", color: "#00AFAE", sort_order: 10 },
      { id: "type-2", name: "교우관계", color: "#7C3AED", sort_order: 30 },
    ];
    const db = {
      prepare: (sql: string) => {
        const statement = {
          bind: () => statement,
          first: async () => membership,
          all: async () => ({
            results: sql.includes("counseling_types") ? rows : [],
          }),
        };
        return statement;
      },
    };
    const response = await worker.fetch(
      new Request("https://example.com/api/v1/counseling-types", {
        headers: {
          "Cf-Access-Authenticated-User-Email": "teacher@example.com",
        },
      }),
      { ...createEnv(), DB: db } as unknown as Env,
    );
    const body = (await response.json()) as { data: typeof rows };

    expect(response.status).toBe(200);
    expect(body.data).toEqual(rows);
  });
});

describe("GET /api/v1/me", () => {
  it("requires a Cloudflare Access identity", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/v1/me"),
      createEnv(),
    );
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns the workspace membership for an Access identity", async () => {
    const membership = {
      email: "teacher@example.com",
      display_name: "김선생",
      role: "teacher",
      workspace_id: "1429c877-c06c-498d-a28e-296610483a4a",
      workspace_name: "푸른중학교",
    };
    const statement = { bind: () => statement, first: async () => membership };
    const env = {
      ...createEnv(),
      DB: { prepare: () => statement },
    } as unknown as Env;
    const request = new Request("https://example.com/api/v1/me", {
      headers: { "Cf-Access-Authenticated-User-Email": "teacher@example.com" },
    });

    const response = await worker.fetch(request, env);
    const body = (await response.json()) as {
      data: { email: string; role: string; workspace: { id: string } };
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      email: "teacher@example.com",
      name: "김선생",
      role: "teacher",
      workspace: { id: membership.workspace_id, name: "푸른중학교" },
    });
  });
});

describe("POST /api/v1/students/import", () => {
  it("imports validated Excel rows as students and enrollments", async () => {
    const membership = {
      email: "teacher@example.com",
      display_name: "김선생",
      role: "teacher",
      workspace_id: "1429c877-c06c-498d-a28e-296610483a4a",
      workspace_name: "푸른중학교",
    };
    let batchSize = 0;
    const db = {
      prepare: (sql: string) => {
        const statement = {
          bind: () => statement,
          first: async () => membership,
          all: async () => ({
            results: sql.includes("student_enrollments") ? [] : [],
          }),
        };
        return statement;
      },
      batch: async (statements: unknown[]) => {
        batchSize = statements.length;
        return [];
      },
    };
    const env = { ...createEnv(), DB: db } as unknown as Env;
    const request = new Request("https://example.com/api/v1/students/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cf-Access-Authenticated-User-Email": "teacher@example.com",
      },
      body: JSON.stringify({
        rows: [
          { name: "학생1", grade: 2, classNo: 3, studentNo: 21 },
          { name: "학생2", grade: 2, classNo: 3, studentNo: 22 },
        ],
      }),
    });

    const response = await worker.fetch(request, env);
    const body = (await response.json()) as {
      data: { imported: number; skipped: number };
    };

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({ imported: 2, skipped: 0 });
    expect(batchSize).toBe(5);
  });
});

describe("GET /api/v1/backup/export", () => {
  it("returns a downloadable workspace-scoped backup", async () => {
    const membership = {
      email: "teacher@example.com",
      display_name: "김선생",
      role: "teacher",
      workspace_id: "1429c877-c06c-498d-a28e-296610483a4a",
      workspace_name: "푸른중학교",
    };
    const statement = {
      bind: () => statement,
      first: async () => membership,
      all: async () => ({ results: [] }),
    };
    const env = {
      ...createEnv(),
      DB: { prepare: () => statement },
    } as unknown as Env;
    const request = new Request("https://example.com/api/v1/backup/export", {
      headers: { "Cf-Access-Authenticated-User-Email": "teacher@example.com" },
    });

    const response = await worker.fetch(request, env);
    const body = (await response.json()) as {
      format: string;
      data: { students: unknown[] };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(body.format).toBe("student-counseling-backup");
    expect(body.data.students).toEqual([]);
  });
});
