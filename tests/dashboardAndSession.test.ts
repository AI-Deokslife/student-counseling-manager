import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalData,
  localApi,
  localDb,
} from "../src/lib/localDb";
import {
  createSession,
  getAdminPasswordCredential,
  hasValidSession,
  hashPassword,
  verifyPassword,
} from "../worker/session";
import worker from "../worker";
import type { Env } from "../worker/types";

describe("local dashboard data", () => {
  beforeEach(async () => {
    await clearLocalData();
  });

  it("uses the same records for dashboard cards and lists", async () => {
    await localApi.createStudent({
      name: "Dashboard Student",
      grade: 2,
      classNo: 1,
      studentNo: 1,
    });
    const [student] = await localApi.students();
    const [type] = await localApi.counselingTypes();
    const date = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Seoul",
    });

    await localApi.createCounseling({
      studentId: student.id,
      counselingTypeId: type.id,
      date,
      summary: "Dashboard record",
      content: "Record content",
      status: "follow_up",
      followUpDate: "2030-01-01",
    });

    const dashboard = await localApi.dashboard();
    expect(dashboard.stats.todayCounseling).toBe(
      dashboard.todayCounseling.length,
    );
    expect(dashboard.stats.followUpRequired).toBe(dashboard.followUps.length);
  });

  it("moves selected students to the local trash together", async () => {
    await localApi.createStudent({
      name: "First Student",
      grade: 1,
      classNo: 3,
      studentNo: 2,
    });
    await localApi.createStudent({
      name: "Second Student",
      grade: 1,
      classNo: 3,
      studentNo: 3,
    });
    const studentIds = (await localApi.students()).map((student) => student.id);

    await localApi.trashStudents(studentIds);

    expect(await localApi.students()).toHaveLength(0);
    expect((await localApi.trash()).students).toHaveLength(2);
  });
});

describe("local administrator access", () => {
  beforeEach(async () => {
    await localApi.logout();
    await localDb.settings.clear();
  });

  it("requires the initial PIN, supports changing it, and locks on logout", async () => {
    await expect(localApi.me()).rejects.toThrow("LOCAL_UNAUTHENTICATED");
    await expect(localApi.login("local", "0000")).rejects.toThrow(
      "관리자 비밀번호가 맞지 않습니다.",
    );

    await localApi.login("local", "1234");
    await expect(localApi.me()).resolves.toMatchObject({ role: "owner" });

    await localApi.changePassword("1234", "5678");
    await localApi.logout();
    await expect(localApi.me()).rejects.toThrow("LOCAL_UNAUTHENTICATED");
    await expect(localApi.login("local", "1234")).rejects.toThrow(
      "관리자 비밀번호가 맞지 않습니다.",
    );
    await expect(localApi.login("local", "5678")).resolves.toBeUndefined();
  });
});

describe("administrator password credentials", () => {
  it("stores only a bcrypt hash and invalidates old sessions after a change", async () => {
    const passwordHash = await hashPassword("initial-password-123");
    let updatedAt = "2026-09-13T00:00:00.000Z";
    const db = {
      prepare: () => {
        const statement = {
          bind: () => statement,
          first: async () => ({ password_hash: passwordHash, updated_at: updatedAt }),
        };
        return statement;
      },
    };
    const env = {
      DB: db,
      ASSETS: { fetch: async () => new Response() },
      APP_ENV: "local",
      APP_VERSION: "0.1.0",
      SESSION_SECRET: "session-test-secret",
    } as unknown as Env;
    const credential = await getAdminPasswordCredential(env);
    const token = await createSession(
      env.SESSION_SECRET!,
      credential!.sessionVersion,
    );
    const request = new Request("https://example.com", {
      headers: { Cookie: `maum_session=${token}` },
    });

    expect(
      await verifyPassword("initial-password-123", credential!.passwordHash),
    ).toBe(true);
    expect(await hasValidSession(request, env)).toBe(true);

    updatedAt = "2026-09-13T01:00:00.000Z";
    expect(await hasValidSession(request, env)).toBe(false);
  });
});

describe("cloud dashboard data", () => {
  it("uses the same records for cloud dashboard cards and lists", async () => {
    const membership = {
      email: "owner@example.com",
      display_name: "Owner",
      role: "owner",
      workspace_id: "1429c877-c06c-498d-a28e-296610483a4a",
      workspace_name: "Workspace",
    };
    const db = {
      prepare: (sql: string) => {
        const statement = {
          bind: () => statement,
          first: async () => {
            if (sql.includes("FROM users")) return membership;
            if (sql.includes("FROM students")) return { count: 20 };
            if (sql.includes("counseling_date BETWEEN")) return { count: 6 };
            return null;
          },
          all: async () => {
            if (sql.includes("counseling_time")) {
              return {
                results: [
                  {
                    id: "record-today",
                    counseling_time: null,
                    summary: "Today",
                    student_name: "Student A",
                  },
                ],
              };
            }
            return {
              results: [
                {
                  id: "record-follow-up",
                  summary: "Follow up",
                  follow_up_date: "2030-01-01",
                  student_name: "Student A",
                },
              ],
            };
          },
        };
        return statement;
      },
    };
    const env = {
      DB: db,
      ASSETS: { fetch: async () => new Response() },
      APP_ENV: "local",
      APP_VERSION: "0.1.0",
    } as unknown as Env;

    const response = await worker.fetch(
      new Request("https://example.com/api/v1/dashboard", {
        headers: { "Cf-Access-Authenticated-User-Email": membership.email },
      }),
      env,
    );
    const body = (await response.json()) as {
      data: {
        stats: { todayCounseling: number; followUpRequired: number };
        todayCounseling: unknown[];
        followUps: unknown[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.stats.todayCounseling).toBe(body.data.todayCounseling.length);
    expect(body.data.stats.followUpRequired).toBe(body.data.followUps.length);
  });

  it("accepts only selected UUIDs for a workspace-scoped bulk trash", async () => {
    const membership = {
      email: "owner@example.com",
      display_name: "Owner",
      role: "owner",
      workspace_id: "1429c877-c06c-498d-a28e-296610483a4a",
      workspace_name: "Workspace",
    };
    let batchSize = 0;
    const db = {
      prepare: () => {
        const statement = {
          bind: () => statement,
          first: async () => membership,
        };
        return statement;
      },
      batch: async (statements: unknown[]) => {
        batchSize = statements.length;
        return [];
      },
    };
    const studentId = "a2f88ff1-fd46-4a45-8fd5-3cb9b4cf9a51";
    const response = await worker.fetch(
      new Request("https://example.com/api/v1/students/bulk-trash", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cf-Access-Authenticated-User-Email": membership.email,
        },
        body: JSON.stringify({ ids: [studentId] }),
      }),
      {
        DB: db,
        ASSETS: { fetch: async () => new Response() },
        APP_ENV: "local",
        APP_VERSION: "0.1.0",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(batchSize).toBe(2);
  });
});
