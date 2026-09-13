import { authenticate } from "./auth";
import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { errorResponse, json, withSecurityHeaders } from "./http";
import {
  createSession,
  expiredSessionCookie,
  getAdminPasswordCredential,
  hashPassword,
  loginClientKey,
  sessionCookie,
  verifyPassword,
} from "./session";
import type { Env } from "./types";

interface LoginInput {
  username?: unknown;
  password?: unknown;
}

interface PasswordChangeInput {
  currentPassword?: unknown;
  newPassword?: unknown;
}

interface PushSubscriptionInput {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

const ADMIN_PASSWORD_MIN_LENGTH = 8;
const REMINDER_MESSAGE = "1시간 후 상담 일정이 있습니다.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function optionalInteger(
  value: unknown,
  min: number,
  max: number,
): number | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
    ? Number(value)
    : undefined;
}

async function parseLoginInput(
  request: Request,
): Promise<{ username: string; password: string } | null> {
  try {
    const body = (await request.json()) as LoginInput;
    if (typeof body.username !== "string" || typeof body.password !== "string")
      return null;
    if (
      body.username.length < 1 ||
      body.username.length > 100 ||
      body.password.length < ADMIN_PASSWORD_MIN_LENGTH ||
      body.password.length > 256
    )
      return null;
    return { username: body.username, password: body.password };
  } catch {
    return null;
  }
}

async function parsePasswordChangeInput(
  request: Request,
): Promise<{ currentPassword: string; newPassword: string } | null> {
  try {
    const body = (await request.json()) as PasswordChangeInput;
    if (
      typeof body.currentPassword !== "string" ||
      typeof body.newPassword !== "string" ||
      body.currentPassword.length < ADMIN_PASSWORD_MIN_LENGTH ||
      body.currentPassword.length > 256 ||
      body.newPassword.length < ADMIN_PASSWORD_MIN_LENGTH ||
      body.newPassword.length > 256 ||
      body.currentPassword === body.newPassword
    ) return null;
    return { currentPassword: body.currentPassword, newPassword: body.newPassword };
  } catch {
    return null;
  }
}

async function handleApi(
  request: Request,
  env: Env,
  requestId: string,
): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === "GET" && pathname === "/api/v1/health") {
    let database: "ok" | "unavailable" = "ok";
    try {
      await env.DB.prepare("SELECT 1 AS health").first();
    } catch {
      database = "unavailable";
    }

    return json(
      {
        data: {
          status: "ok",
          appVersion: env.APP_VERSION ?? "0.1.0",
          database,
          environment: env.APP_ENV,
        },
        meta: { requestId },
      },
      requestId,
      database === "ok" ? 200 : 503,
    );
  }

  if (pathname === "/api/v1/counseling-types" && request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const rows = await env.DB.prepare(
      "SELECT id, name, color, sort_order FROM counseling_types WHERE workspace_id = ? AND is_active = 1 ORDER BY sort_order, name",
    )
      .bind(user.workspace.id)
      .all();
    return json({ data: rows.results, meta: { requestId } }, requestId);
  }

  if (request.method === "POST" && pathname === "/api/v1/auth/login") {
    const input = await parseLoginInput(request);
    if (!input)
      return errorResponse(
        "VALIDATION_ERROR",
        "아이디와 비밀번호를 확인해주세요.",
        requestId,
        400,
      );
    if (
      !env.ADMIN_USERNAME ||
      !env.SESSION_SECRET
    ) {
      return errorResponse(
        "AUTH_NOT_CONFIGURED",
        "관리자 로그인이 아직 설정되지 않았습니다.",
        requestId,
        503,
      );
    }

    const clientKey = await loginClientKey(request, env.SESSION_SECRET);
    const rateLimit = await env.DB.prepare(
      "SELECT attempts, window_started_at, blocked_until FROM auth_rate_limits WHERE client_key = ?",
    )
      .bind(clientKey)
      .first<{
        attempts: number;
        window_started_at: string;
        blocked_until: string | null;
      }>();
    if (
      rateLimit?.blocked_until &&
      rateLimit.blocked_until > new Date().toISOString()
    ) {
      return errorResponse(
        "RATE_LIMITED",
        "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
        requestId,
        429,
      );
    }

    const credential = await getAdminPasswordCredential(env);
    if (!credential) {
      return errorResponse(
        "AUTH_NOT_CONFIGURED",
        "관리자 로그인 설정이 완료되지 않았습니다.",
        requestId,
        503,
      );
    }

    const usernameMatches = input.username === env.ADMIN_USERNAME;
    const passwordMatches = await verifyPassword(
      input.password,
      credential.passwordHash,
    );
    if (!usernameMatches || !passwordMatches) {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 15 * 60_000).toISOString();
      const recentAttempts =
        rateLimit && rateLimit.window_started_at >= cutoff
          ? rateLimit.attempts
          : 0;
      const blockedUntil =
        recentAttempts >= 4
          ? new Date(now.getTime() + 15 * 60_000).toISOString()
          : null;
      await env.DB.prepare(
        `
        INSERT INTO auth_rate_limits (client_key, attempts, window_started_at, blocked_until)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(client_key) DO UPDATE SET
          attempts = CASE WHEN window_started_at < ? THEN 1 ELSE attempts + 1 END,
          window_started_at = CASE WHEN window_started_at < ? THEN excluded.window_started_at ELSE window_started_at END,
          blocked_until = excluded.blocked_until
      `,
      )
        .bind(clientKey, now.toISOString(), blockedUntil, cutoff, cutoff)
        .run();
      return errorResponse(
        "INVALID_CREDENTIALS",
        "아이디 또는 비밀번호가 올바르지 않습니다.",
        requestId,
        401,
      );
    }

    await env.DB.prepare("DELETE FROM auth_rate_limits WHERE client_key = ?")
      .bind(clientKey)
      .run();

    const response = json(
      { data: { authenticated: true }, meta: { requestId } },
      requestId,
    );
    response.headers.append(
      "Set-Cookie",
      sessionCookie(await createSession(env.SESSION_SECRET, credential.sessionVersion)),
    );
    return response;
  }

  if (request.method === "POST" && pathname === "/api/v1/auth/logout") {
    const response = json(
      { data: { authenticated: false }, meta: { requestId } },
      requestId,
    );
    response.headers.append("Set-Cookie", expiredSessionCookie());
    return response;
  }

  if (request.method === "POST" && pathname === "/api/v1/auth/password") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse("UNAUTHENTICATED", "로그인이 필요합니다.", requestId, 401);
    if (!['owner', 'admin'].includes(user.role))
      return errorResponse("FORBIDDEN", "관리자만 비밀번호를 변경할 수 있습니다.", requestId, 403);
    if (!env.SESSION_SECRET)
      return errorResponse("AUTH_NOT_CONFIGURED", "관리자 로그인 설정이 완료되지 않았습니다.", requestId, 503);

    const input = await parsePasswordChangeInput(request);
    if (!input)
      return errorResponse(
        "VALIDATION_ERROR",
        "현재 비밀번호와 8자 이상의 새 비밀번호를 확인해 주세요.",
        requestId,
        400,
      );

    const credential = await getAdminPasswordCredential(env);
    if (!credential || !(await verifyPassword(input.currentPassword, credential.passwordHash)))
      return errorResponse("INVALID_CREDENTIALS", "현재 비밀번호가 올바르지 않습니다.", requestId, 401);

    const updatedAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO admin_credentials (id, password_hash, updated_at, updated_by)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           password_hash = excluded.password_hash,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      ).bind('primary', await hashPassword(input.newPassword), updatedAt, user.email),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), user.workspace.id, "admin_credential", "primary", "password_change", updatedAt),
    ]);

    const response = json({ data: { changed: true }, meta: { requestId } }, requestId);
    response.headers.append(
      "Set-Cookie",
      sessionCookie(await createSession(env.SESSION_SECRET, updatedAt)),
    );
    return response;
  }

  if (pathname === "/api/v1/notifications/push/config" && request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user) return errorResponse("UNAUTHENTICATED", "로그인이 필요합니다.", requestId, 401);
    if (!env.VAPID_PUBLIC_KEY)
      return errorResponse("PUSH_NOT_CONFIGURED", "푸시 알림이 아직 설정되지 않았습니다.", requestId, 503);
    return json({ data: { publicKey: env.VAPID_PUBLIC_KEY }, meta: { requestId } }, requestId);
  }

  if (pathname === "/api/v1/notifications/push" && request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user) return errorResponse("UNAUTHENTICATED", "로그인이 필요합니다.", requestId, 401);
    if (user.role === "readonly")
      return errorResponse("FORBIDDEN", "알림 설정 권한이 없습니다.", requestId, 403);
    const body = await parseObject(request) as PushSubscriptionInput | null;
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
    if (!endpoint.startsWith("https://") || endpoint.length > 2_000 || !p256dh || !auth)
      return errorResponse("VALIDATION_ERROR", "푸시 구독 정보를 확인해 주세요.", requestId, 400);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (id, workspace_id, user_email, endpoint, p256dh, auth, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET workspace_id=excluded.workspace_id, user_email=excluded.user_email,
         p256dh=excluded.p256dh, auth=excluded.auth, updated_at=excluded.updated_at`,
    ).bind(crypto.randomUUID(), user.workspace.id, user.email, endpoint, p256dh, auth, now, now).run();
    return json({ data: { enabled: true }, meta: { requestId } }, requestId, 201);
  }

  if (pathname === "/api/v1/notifications/push" && request.method === "DELETE") {
    const user = await authenticate(request, env);
    if (!user) return errorResponse("UNAUTHENTICATED", "로그인이 필요합니다.", requestId, 401);
    const body = await parseObject(request) as PushSubscriptionInput | null;
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    if (!endpoint) return errorResponse("VALIDATION_ERROR", "푸시 구독 정보를 확인해 주세요.", requestId, 400);
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE workspace_id = ? AND user_email = ? AND endpoint = ?")
      .bind(user.workspace.id, user.email, endpoint).run();
    return json({ data: { enabled: false }, meta: { requestId } }, requestId);
  }

  if (request.method === "GET" && pathname === "/api/v1/me") {
    const user = await authenticate(request, env);
    if (!user) {
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    }
    return json({ data: user, meta: { requestId } }, requestId);
  }

  if (pathname === "/api/v1/students") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );

    if (request.method === "GET") {
      const rows = await env.DB.prepare(
        `
        SELECT students.id, students.name, students.is_favorite, students.status, students.updated_at,
          student_enrollments.school_year, student_enrollments.grade,
          student_enrollments.class_no, student_enrollments.student_no
        FROM students
        LEFT JOIN student_enrollments ON student_enrollments.student_id = students.id
          AND student_enrollments.school_year = 2026
        WHERE students.workspace_id = ? AND students.deleted_at IS NULL
        ORDER BY student_enrollments.grade ASC, student_enrollments.class_no ASC,
          student_enrollments.student_no ASC, students.name ASC
        LIMIT 100
      `,
      )
        .bind(user.workspace.id)
        .all();
      return json(
        {
          data: rows.results,
          meta: {
            page: 1,
            pageSize: 100,
            total: rows.results.length,
            requestId,
          },
        },
        requestId,
      );
    }

    if (request.method === "POST") {
      const body = await parseObject(request);
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const grade = optionalInteger(body?.grade, 1, 12);
      const classNo = optionalInteger(body?.classNo, 1, 99);
      const studentNo = optionalInteger(body?.studentNo, 1, 999);
      if (
        !name ||
        name.length > 100 ||
        grade === undefined ||
        classNo === undefined ||
        studentNo === undefined
      ) {
        return errorResponse(
          "VALIDATION_ERROR",
          "학생 정보를 확인해주세요.",
          requestId,
          400,
        );
      }

      const id = crypto.randomUUID();
      const enrollmentId = crypto.randomUUID();
      const auditId = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO students (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        ).bind(id, user.workspace.id, name, now, now),
        env.DB.prepare(
          "INSERT INTO student_enrollments (id, workspace_id, student_id, school_year, grade, class_no, student_no, created_at, updated_at) VALUES (?, ?, ?, 2026, ?, ?, ?, ?, ?)",
        ).bind(
          enrollmentId,
          user.workspace.id,
          id,
          grade,
          classNo,
          studentNo,
          now,
          now,
        ),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(auditId, user.workspace.id, "student", id, "create", now),
      ]);
      return json(
        {
          data: {
            id,
            name,
            school_year: 2026,
            grade,
            class_no: classNo,
            student_no: studentNo,
            is_favorite: 0,
            status: "active",
          },
          meta: { requestId },
        },
        requestId,
        201,
      );
    }
  }

  if (pathname === "/api/v1/students/import" && request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const body = await parseObject(request);
    const rows = Array.isArray(body?.rows) ? body.rows.filter(isRecord) : null;
    if (!rows || rows.length < 1 || rows.length > 200)
      return errorResponse(
        "VALIDATION_ERROR",
        "한 번에 1~200명의 학생을 등록할 수 있습니다.",
        requestId,
        400,
      );

    const normalized = rows.map((row, index) => ({
      index,
      name: typeof row.name === "string" ? row.name.trim() : "",
      grade: optionalInteger(row.grade, 1, 12),
      classNo: optionalInteger(row.classNo, 1, 99),
      studentNo: optionalInteger(row.studentNo, 1, 999),
    }));
    if (
      normalized.some(
        (row) =>
          !row.name ||
          row.name.length > 100 ||
          row.grade === undefined ||
          row.classNo === undefined ||
          row.studentNo === undefined,
      )
    ) {
      return errorResponse(
        "VALIDATION_ERROR",
        "학생 명단에 올바르지 않은 값이 있습니다.",
        requestId,
        400,
      );
    }

    const existing = await env.DB.prepare(
      `SELECT students.name, student_enrollments.grade, student_enrollments.class_no, student_enrollments.student_no FROM students LEFT JOIN student_enrollments ON student_enrollments.student_id = students.id AND student_enrollments.school_year = 2026 WHERE students.workspace_id = ? AND students.deleted_at IS NULL`,
    )
      .bind(user.workspace.id)
      .all<Record<string, unknown>>();
    const keys = new Set(
      existing.results.map((row) =>
        row.grade && row.class_no && row.student_no
          ? `${row.grade}:${row.class_no}:${row.student_no}`
          : `name:${String(row.name).trim().toLocaleLowerCase("ko-KR")}`,
      ),
    );
    const accepted: typeof normalized = [];
    const skipped: number[] = [];
    for (const row of normalized) {
      const key =
        row.grade && row.classNo && row.studentNo
          ? `${row.grade}:${row.classNo}:${row.studentNo}`
          : `name:${row.name.toLocaleLowerCase("ko-KR")}`;
      if (keys.has(key)) {
        skipped.push(row.index + 2);
        continue;
      }
      keys.add(key);
      accepted.push(row);
    }
    const now = new Date().toISOString();
    const statements = [];
    for (const row of accepted) {
      const studentId = crypto.randomUUID();
      statements.push(
        env.DB.prepare(
          "INSERT INTO students (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        ).bind(studentId, user.workspace.id, row.name, now, now),
      );
      statements.push(
        env.DB.prepare(
          "INSERT INTO student_enrollments (id, workspace_id, student_id, school_year, grade, class_no, student_no, created_at, updated_at) VALUES (?, ?, ?, 2026, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          user.workspace.id,
          studentId,
          row.grade,
          row.classNo,
          row.studentNo,
          now,
          now,
        ),
      );
    }
    statements.push(
      env.DB.prepare(
        "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        user.workspace.id,
        "student_import",
        user.workspace.id,
        "excel_import",
        JSON.stringify({ imported: accepted.length, skipped: skipped.length }),
        now,
      ),
    );
    await env.DB.batch(statements);
    return json(
      {
        data: {
          imported: accepted.length,
          skipped: skipped.length,
          skippedRows: skipped,
        },
        meta: { requestId },
      },
      requestId,
      201,
    );
  }

  if (pathname === "/api/v1/students/bulk-trash" && request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const body = await parseObject(request);
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    const validIds = ids.filter(
      (id): id is string =>
        typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id),
    );
    const uniqueIds = [...new Set(validIds)];
    if (
      !uniqueIds.length ||
      uniqueIds.length > 100 ||
      uniqueIds.length !== ids.length
    )
      return errorResponse(
        "VALIDATION_ERROR",
        "한 번에 1~100명의 학생만 선택할 수 있습니다.",
        requestId,
        400,
      );

    const updatedAt = new Date().toISOString();
    const statements = uniqueIds.flatMap((studentId) => [
      env.DB.prepare(
        "UPDATE students SET deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
      ).bind(updatedAt, updatedAt, studentId, user.workspace.id),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        user.workspace.id,
        "student",
        studentId,
        "trash",
        updatedAt,
      ),
    ]);
    await env.DB.batch(statements);
    return json(
      { data: { trashed: uniqueIds.length }, meta: { requestId } },
      requestId,
    );
  }

  const studentMatch = pathname.match(
    /^\/api\/v1\/students\/([0-9a-f-]{36})(\/restore)?$/i,
  );
  if (studentMatch) {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const studentId = studentMatch[1];
    if (studentMatch[2] && request.method === "POST") {
      const now = new Date().toISOString();
      const result = await env.DB.prepare(
        "UPDATE students SET deleted_at = NULL, updated_at = ? WHERE id = ? AND workspace_id = ? AND deleted_at IS NOT NULL",
      )
        .bind(now, studentId, user.workspace.id)
        .run();
      if (!result.success)
        return errorResponse(
          "NOT_FOUND",
          "복원할 학생을 찾을 수 없습니다.",
          requestId,
          404,
        );
      await env.DB.prepare(
        "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(
          crypto.randomUUID(),
          user.workspace.id,
          "student",
          studentId,
          "restore",
          now,
        )
        .run();
      return json(
        { data: { id: studentId, restored: true }, meta: { requestId } },
        requestId,
      );
    }
    if (request.method === "GET") {
      const student = await env.DB.prepare(
        `SELECT students.id, students.name, students.phone, students.parent_phone, students.memo, students.is_favorite, students.status, students.created_at, students.updated_at, students.deleted_at, student_enrollments.school_year, student_enrollments.grade, student_enrollments.class_no, student_enrollments.student_no FROM students LEFT JOIN student_enrollments ON student_enrollments.student_id = students.id AND student_enrollments.school_year = 2026 WHERE students.id = ? AND students.workspace_id = ?`,
      )
        .bind(studentId, user.workspace.id)
        .first();
      if (!student)
        return errorResponse(
          "NOT_FOUND",
          "학생을 찾을 수 없습니다.",
          requestId,
          404,
        );
      return json({ data: student, meta: { requestId } }, requestId);
    }
    if (request.method === "PATCH") {
      const body = await parseObject(request);
      const current = await env.DB.prepare(
        "SELECT name, phone, parent_phone, memo, is_favorite, status, updated_at FROM students WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
      )
        .bind(studentId, user.workspace.id)
        .first<Record<string, unknown>>();
      if (!current)
        return errorResponse(
          "NOT_FOUND",
          "학생을 찾을 수 없습니다.",
          requestId,
          404,
        );
      if (
        typeof body?.updatedAt !== "string" ||
        body.updatedAt !== current.updated_at
      )
        return errorResponse(
          "CONFLICT",
          "다른 곳에서 학생 정보가 수정되었습니다.",
          requestId,
          409,
        );
      const name =
        typeof body.name === "string" ? body.name.trim() : String(current.name);
      const phone =
        typeof body.phone === "string"
          ? body.phone.trim() || null
          : current.phone;
      const parentPhone =
        typeof body.parentPhone === "string"
          ? body.parentPhone.trim() || null
          : current.parent_phone;
      const memo =
        typeof body.memo === "string" ? body.memo.trim() || null : current.memo;
      const favorite =
        typeof body.favorite === "boolean"
          ? Number(body.favorite)
          : Number(current.is_favorite);
      const status =
        typeof body.status === "string" ? body.status : String(current.status);
      if (
        !name ||
        name.length > 100 ||
        !["active", "graduated", "transferred", "inactive"].includes(status)
      )
        return errorResponse(
          "VALIDATION_ERROR",
          "학생 정보를 확인해주세요.",
          requestId,
          400,
        );
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE students SET name = ?, phone = ?, parent_phone = ?, memo = ?, is_favorite = ?, status = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND updated_at = ?",
        ).bind(
          name,
          phone,
          parentPhone,
          memo,
          favorite,
          status,
          now,
          studentId,
          user.workspace.id,
          body.updatedAt,
        ),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, before_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          user.workspace.id,
          "student",
          studentId,
          "update",
          JSON.stringify({
            status: current.status,
            favorite: current.is_favorite,
          }),
          now,
        ),
      ]);
      return json(
        { data: { id: studentId, updatedAt: now }, meta: { requestId } },
        requestId,
      );
    }
    if (request.method === "DELETE") {
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE students SET deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
        ).bind(now, now, studentId, user.workspace.id),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          user.workspace.id,
          "student",
          studentId,
          "trash",
          now,
        ),
      ]);
      return new Response(null, {
        status: 204,
        headers: { "X-Request-Id": requestId },
      });
    }
  }

  if (pathname === "/api/v1/counseling") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    if (request.method === "GET") {
      const rows = await env.DB.prepare(
        `
        SELECT counseling_records.id, counseling_records.student_id, students.name AS student_name,
          counseling_records.counseling_type_id, counseling_types.name AS counseling_type_name,
          counseling_types.color AS counseling_type_color,
          counseling_records.counseling_date, counseling_records.summary,
          counseling_records.content, counseling_records.status, counseling_records.follow_up_date,
          counseling_records.created_at, counseling_records.updated_at
        FROM counseling_records
        INNER JOIN students ON students.id = counseling_records.student_id
        LEFT JOIN counseling_types ON counseling_types.id = counseling_records.counseling_type_id
        WHERE counseling_records.workspace_id = ? AND counseling_records.deleted_at IS NULL
        ORDER BY counseling_records.counseling_date DESC, counseling_records.created_at DESC
        LIMIT 100
      `,
      )
        .bind(user.workspace.id)
        .all();
      return json(
        {
          data: rows.results,
          meta: {
            page: 1,
            pageSize: 100,
            total: rows.results.length,
            requestId,
          },
        },
        requestId,
      );
    }
    if (request.method !== "POST")
      return errorResponse(
        "METHOD_NOT_ALLOWED",
        "허용되지 않은 요청입니다.",
        requestId,
        405,
      );
    const body = await parseObject(request);
    const studentId = typeof body?.studentId === "string" ? body.studentId : "";
    const counselingTypeId =
      typeof body?.counselingTypeId === "string" ? body.counselingTypeId : "";
    const summary =
      typeof body?.summary === "string" ? body.summary.trim() : "";
    const date = typeof body?.date === "string" ? body.date : "";
    const content =
      typeof body?.content === "string" ? body.content.trim() : "";
    const status = typeof body?.status === "string" ? body.status : "normal";
    const followUpDate =
      body?.followUpDate === null ||
      (typeof body?.followUpDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(body.followUpDate))
        ? body.followUpDate
        : null;
    const allowedStatuses = [
      "normal",
      "monitoring",
      "follow_up",
      "in_progress",
      "completed",
    ];
    if (
      !/^[0-9a-f-]{36}$/i.test(studentId) ||
      !/^[0-9a-f-]{36}$/i.test(counselingTypeId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !summary ||
      summary.length > 500 ||
      content.length > 50_000 ||
      !allowedStatuses.includes(status)
    ) {
      return errorResponse(
        "VALIDATION_ERROR",
        "상담 기록을 확인해주세요.",
        requestId,
        400,
      );
    }
    const student = await env.DB.prepare(
      "SELECT id FROM students WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
    )
      .bind(studentId, user.workspace.id)
      .first();
    if (!student)
      return errorResponse(
        "NOT_FOUND",
        "학생을 찾을 수 없습니다.",
        requestId,
        404,
      );

    const counselingType = await env.DB.prepare(
      "SELECT id FROM counseling_types WHERE id = ? AND workspace_id = ? AND is_active = 1",
    )
      .bind(counselingTypeId, user.workspace.id)
      .first();
    if (!counselingType)
      return errorResponse(
        "VALIDATION_ERROR",
        "상담 유형을 확인해 주세요.",
        requestId,
        400,
      );

    const id = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO counseling_records (id, workspace_id, student_id, counseling_type_id, counseling_date, summary, content, status, follow_up_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        user.workspace.id,
        studentId,
        counselingTypeId,
        date,
        summary,
        content,
        status,
        followUpDate,
        now,
        now,
      ),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(auditId, user.workspace.id, "counseling", id, "create", now),
    ]);
    return json(
      {
        data: {
          id,
          studentId,
          date,
          summary,
          content,
          status,
          followUpDate,
          createdAt: now,
          updatedAt: now,
        },
        meta: { requestId },
      },
      requestId,
      201,
    );
  }

  const counselingMatch = pathname.match(
    /^\/api\/v1\/counseling\/([0-9a-f-]{36})(\/restore)?$/i,
  );
  if (counselingMatch) {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const recordId = counselingMatch[1];
    if (counselingMatch[2] && request.method === "POST") {
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE counseling_records SET deleted_at = NULL, updated_at = ? WHERE id = ? AND workspace_id = ? AND deleted_at IS NOT NULL",
        ).bind(now, recordId, user.workspace.id),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          user.workspace.id,
          "counseling",
          recordId,
          "restore",
          now,
        ),
      ]);
      return json(
        { data: { id: recordId, restored: true }, meta: { requestId } },
        requestId,
      );
    }
    const current = await env.DB.prepare(
      `SELECT counseling_records.*, students.name AS student_name, counseling_types.name AS counseling_type_name, counseling_types.color AS counseling_type_color FROM counseling_records INNER JOIN students ON students.id = counseling_records.student_id LEFT JOIN counseling_types ON counseling_types.id = counseling_records.counseling_type_id WHERE counseling_records.id = ? AND counseling_records.workspace_id = ?`,
    )
      .bind(recordId, user.workspace.id)
      .first<Record<string, unknown>>();
    if (!current)
      return errorResponse(
        "NOT_FOUND",
        "상담 기록을 찾을 수 없습니다.",
        requestId,
        404,
      );
    if (request.method === "GET")
      return json({ data: current, meta: { requestId } }, requestId);
    if (request.method === "PATCH") {
      const body = await parseObject(request);
      if (
        typeof body?.updatedAt !== "string" ||
        body.updatedAt !== current.updated_at
      )
        return errorResponse(
          "CONFLICT",
          "다른 곳에서 이 상담 기록이 수정되었습니다.",
          requestId,
          409,
        );
      const summary =
        typeof body.summary === "string"
          ? body.summary.trim()
          : String(current.summary ?? "");
      const counselingTypeId =
        typeof body.counselingTypeId === "string"
          ? body.counselingTypeId
          : String(current.counseling_type_id ?? "");
      const content =
        typeof body.content === "string"
          ? body.content.trim()
          : String(current.content ?? "");
      const status =
        typeof body.status === "string" ? body.status : String(current.status);
      const followUpDate =
        body.followUpDate === null || typeof body.followUpDate === "string"
          ? body.followUpDate
          : current.follow_up_date;
      if (
        !summary ||
        !/^[0-9a-f-]{36}$/i.test(counselingTypeId) ||
        summary.length > 500 ||
        content.length > 50_000 ||
        ![
          "normal",
          "monitoring",
          "follow_up",
          "in_progress",
          "completed",
        ].includes(status)
      )
        return errorResponse(
          "VALIDATION_ERROR",
          "상담 기록을 확인해주세요.",
          requestId,
          400,
        );
      const counselingType = await env.DB.prepare(
        "SELECT id FROM counseling_types WHERE id = ? AND workspace_id = ? AND is_active = 1",
      )
        .bind(counselingTypeId, user.workspace.id)
        .first();
      if (!counselingType)
        return errorResponse(
          "VALIDATION_ERROR",
          "상담 유형을 확인해 주세요.",
          requestId,
          400,
        );
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE counseling_records SET counseling_type_id = ?, summary = ?, content = ?, status = ?, follow_up_date = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND updated_at = ?",
        ).bind(
          counselingTypeId,
          summary,
          content,
          status,
          followUpDate,
          now,
          recordId,
          user.workspace.id,
          body.updatedAt,
        ),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          user.workspace.id,
          "counseling",
          recordId,
          "update",
          now,
        ),
      ]);
      return json(
        { data: { id: recordId, updatedAt: now }, meta: { requestId } },
        requestId,
      );
    }
    if (request.method === "DELETE") {
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE counseling_records SET deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
        ).bind(now, now, recordId, user.workspace.id),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          user.workspace.id,
          "counseling",
          recordId,
          "trash",
          now,
        ),
      ]);
      return new Response(null, {
        status: 204,
        headers: { "X-Request-Id": requestId },
      });
    }
  }

  if (pathname === "/api/v1/dashboard" && request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const monday = new Date(`${today}T00:00:00+09:00`);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const toDate = (date: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    const [
      students,
      week,
      todayCounseling,
      followUps,
    ] = await Promise.all([
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM students WHERE workspace_id = ? AND deleted_at IS NULL",
      )
        .bind(user.workspace.id)
        .first<{ count: number }>(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM counseling_records WHERE workspace_id = ? AND deleted_at IS NULL AND counseling_date BETWEEN ? AND ?",
      )
        .bind(user.workspace.id, toDate(monday), toDate(sunday))
        .first<{ count: number }>(),
      env.DB.prepare(
        `SELECT counseling_records.id, counseling_records.counseling_time, counseling_records.summary, students.name AS student_name
         FROM counseling_records
         INNER JOIN students ON students.id = counseling_records.student_id
         WHERE counseling_records.workspace_id = ? AND counseling_records.deleted_at IS NULL AND counseling_records.counseling_date = ?
         ORDER BY counseling_records.counseling_time, counseling_records.created_at`,
      )
        .bind(user.workspace.id, today)
        .all(),
      env.DB.prepare(
        `SELECT counseling_records.id, counseling_records.summary, counseling_records.follow_up_date, students.name AS student_name
         FROM counseling_records
         INNER JOIN students ON students.id = counseling_records.student_id
         WHERE counseling_records.workspace_id = ? AND counseling_records.deleted_at IS NULL
           AND counseling_records.status IN ('follow_up','in_progress') AND counseling_records.follow_up_date IS NOT NULL
         ORDER BY counseling_records.follow_up_date, counseling_records.created_at`,
      )
        .bind(user.workspace.id)
        .all(),
    ]);
    return json(
      {
        data: {
          stats: {
            students: students?.count ?? 0,
            thisWeekCounseling: week?.count ?? 0,
            todayCounseling: todayCounseling.results.length,
            followUpRequired: followUps.results.length,
          },
          todayCounseling: todayCounseling.results,
          followUps: followUps.results,
        },
        meta: { requestId },
      },
      requestId,
    );
  }

  if (pathname === "/api/v1/schedules") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    if (request.method === "GET") {
      const month = new URL(request.url).searchParams.get("month") ?? "";
      if (!/^\d{4}-\d{2}$/.test(month))
        return errorResponse(
          "VALIDATION_ERROR",
          "조회 월을 확인해주세요.",
          requestId,
          400,
        );
      const rows = await env.DB.prepare(
        `
        SELECT schedules.id, schedules.student_id, students.name AS student_name,
          schedules.scheduled_date, schedules.scheduled_time, schedules.note, schedules.status
        FROM schedules
        INNER JOIN students ON students.id = schedules.student_id
        WHERE schedules.workspace_id = ? AND schedules.deleted_at IS NULL
          AND schedules.scheduled_date >= ? AND schedules.scheduled_date < ?
        ORDER BY schedules.scheduled_date ASC, schedules.scheduled_time ASC
      `,
      )
        .bind(user.workspace.id, `${month}-01`, `${month}-32`)
        .all();
      return json({ data: rows.results, meta: { requestId } }, requestId);
    }
    if (request.method === "POST") {
      const body = await parseObject(request);
      const studentId =
        typeof body?.studentId === "string" ? body.studentId : "";
      const date = typeof body?.date === "string" ? body.date : "";
      const time =
        typeof body?.time === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)
          ? body.time
          : null;
      const note = typeof body?.note === "string" ? body.note.trim() : "";
      if (
        !/^[0-9a-f-]{36}$/i.test(studentId) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        note.length > 1000
      ) {
        return errorResponse(
          "VALIDATION_ERROR",
          "일정 정보를 확인해주세요.",
          requestId,
          400,
        );
      }
      const student = await env.DB.prepare(
        "SELECT id FROM students WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
      )
        .bind(studentId, user.workspace.id)
        .first();
      if (!student)
        return errorResponse(
          "NOT_FOUND",
          "학생을 찾을 수 없습니다.",
          requestId,
          404,
        );
      const id = crypto.randomUUID();
      const auditId = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO schedules (id, workspace_id, student_id, scheduled_date, scheduled_time, note, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          id,
          user.workspace.id,
          studentId,
          date,
          time,
          note,
          "scheduled",
          now,
          now,
        ),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(auditId, user.workspace.id, "schedule", id, "create", now),
      ]);
      return json(
        {
          data: { id, studentId, date, time, note, status: "scheduled" },
          meta: { requestId },
        },
        requestId,
        201,
      );
    }
    return errorResponse(
      "METHOD_NOT_ALLOWED",
      "허용되지 않은 요청입니다.",
      requestId,
      405,
    );
  }

  const scheduleMatch = pathname.match(
    /^\/api\/v1\/schedules\/([0-9a-f-]{36})(\/complete)?$/i,
  );
  if (scheduleMatch) {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const scheduleId = scheduleMatch[1];
    const current = await env.DB.prepare(
      "SELECT * FROM schedules WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
    )
      .bind(scheduleId, user.workspace.id)
      .first<Record<string, unknown>>();
    if (!current)
      return errorResponse(
        "NOT_FOUND",
        "일정을 찾을 수 없습니다.",
        requestId,
        404,
      );
    const body = await parseObject(request);
    const now = new Date().toISOString();
    if (scheduleMatch[2] && request.method === "POST") {
      if (current.status !== "scheduled")
        return errorResponse(
          "INVALID_STATE",
          "예정 상태의 일정만 완료할 수 있습니다.",
          requestId,
          409,
        );
      const summary =
        typeof body?.summary === "string" ? body.summary.trim() : "";
      const content =
        typeof body?.content === "string" ? body.content.trim() : "";
      const status =
        typeof body?.status === "string" ? body.status : "completed";
      if (
        !summary ||
        summary.length > 500 ||
        content.length > 50_000 ||
        ![
          "normal",
          "monitoring",
          "follow_up",
          "in_progress",
          "completed",
        ].includes(status)
      )
        return errorResponse(
          "VALIDATION_ERROR",
          "완료 기록을 확인해주세요.",
          requestId,
          400,
        );
      const fallbackType = await env.DB.prepare(
        "SELECT id FROM counseling_types WHERE workspace_id = ? AND is_active = 1 ORDER BY sort_order LIMIT 1",
      )
        .bind(user.workspace.id)
        .first<{ id: string }>();
      const counselingTypeId =
        typeof current.counseling_type_id === "string"
          ? current.counseling_type_id
          : fallbackType?.id;
      if (!counselingTypeId)
        return errorResponse(
          "VALIDATION_ERROR",
          "사용 가능한 상담 유형이 없습니다.",
          requestId,
          400,
        );
      const recordId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO counseling_records (id, workspace_id, student_id, counseling_type_id, counseling_date, counseling_time, summary, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          recordId,
          user.workspace.id,
          current.student_id,
          counselingTypeId,
          current.scheduled_date,
          current.scheduled_time,
          summary,
          content,
          status,
          now,
          now,
        ),
        env.DB.prepare(
          "UPDATE schedules SET status = 'completed', counseling_record_id = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND status = 'scheduled'",
        ).bind(recordId, now, scheduleId, user.workspace.id),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          user.workspace.id,
          "schedule",
          scheduleId,
          "complete",
          now,
        ),
      ]);
      return json(
        {
          data: {
            id: scheduleId,
            counselingRecordId: recordId,
            status: "completed",
          },
          meta: { requestId },
        },
        requestId,
      );
    }
    if (request.method === "PATCH") {
      const date =
        typeof body?.date === "string"
          ? body.date
          : String(current.scheduled_date);
      const time =
        body?.time === null ||
        (typeof body?.time === "string" &&
          /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))
          ? body.time
          : current.scheduled_time;
      const note =
        typeof body?.note === "string"
          ? body.note.trim()
          : String(current.note ?? "");
      const status =
        typeof body?.status === "string" ? body.status : String(current.status);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        note.length > 1000 ||
        !["scheduled", "cancelled"].includes(status)
      )
        return errorResponse(
          "VALIDATION_ERROR",
          "일정 정보를 확인해주세요.",
          requestId,
          400,
        );
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE schedules SET scheduled_date = ?, scheduled_time = ?, note = ?, status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
        ).bind(date, time, note, status, now, scheduleId, user.workspace.id),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          user.workspace.id,
          "schedule",
          scheduleId,
          status === "cancelled" ? "cancel" : "update",
          now,
        ),
      ]);
      return json(
        {
          data: { id: scheduleId, status, updatedAt: now },
          meta: { requestId },
        },
        requestId,
      );
    }
  }

  if (pathname === "/api/v1/search" && request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const params = new URL(request.url).searchParams;
    const q = (params.get("q") ?? "").trim().slice(0, 100);
    const from = params.get("from") ?? "1900-01-01";
    const to = params.get("to") ?? "2999-12-31";
    const status = params.get("status") ?? "";
    const allowedStatus = [
      "normal",
      "monitoring",
      "follow_up",
      "in_progress",
      "completed",
    ];
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      (status && !allowedStatus.includes(status))
    )
      return errorResponse(
        "VALIDATION_ERROR",
        "검색 조건을 확인해주세요.",
        requestId,
        400,
      );
    const like = `%${q}%`;
    const rows = await env.DB.prepare(
      `SELECT counseling_records.id, counseling_records.student_id, students.name AS student_name, counseling_records.counseling_date, counseling_records.summary, counseling_records.content, counseling_records.status, counseling_records.follow_up_date, counseling_records.created_at, counseling_records.updated_at FROM counseling_records INNER JOIN students ON students.id = counseling_records.student_id WHERE counseling_records.workspace_id = ? AND counseling_records.deleted_at IS NULL AND counseling_records.counseling_date BETWEEN ? AND ? AND (? = '' OR counseling_records.status = ?) AND (? = '' OR students.name LIKE ? OR counseling_records.summary LIKE ? OR counseling_records.content LIKE ?) ORDER BY counseling_records.counseling_date DESC LIMIT 500`,
    )
      .bind(user.workspace.id, from, to, status, status, q, like, like, like)
      .all();
    return json(
      { data: rows.results, meta: { total: rows.results.length, requestId } },
      requestId,
    );
  }

  if (pathname === "/api/v1/trash" && request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const [students, counseling] = await Promise.all([
      env.DB.prepare(
        "SELECT id, name, deleted_at FROM students WHERE workspace_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100",
      )
        .bind(user.workspace.id)
        .all(),
      env.DB.prepare(
        "SELECT counseling_records.id, students.name AS student_name, counseling_records.summary, counseling_records.deleted_at FROM counseling_records INNER JOIN students ON students.id = counseling_records.student_id WHERE counseling_records.workspace_id = ? AND counseling_records.deleted_at IS NOT NULL ORDER BY counseling_records.deleted_at DESC LIMIT 100",
      )
        .bind(user.workspace.id)
        .all(),
    ]);
    return json(
      {
        data: { students: students.results, counseling: counseling.results },
        meta: { requestId },
      },
      requestId,
    );
  }

  if (pathname === "/api/v1/backup/export" && request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const [
      students,
      enrollments,
      counselingRecords,
      counselingTypes,
      schedules,
    ] = await Promise.all([
      env.DB.prepare("SELECT * FROM students WHERE workspace_id = ?")
        .bind(user.workspace.id)
        .all(),
      env.DB.prepare("SELECT * FROM student_enrollments WHERE workspace_id = ?")
        .bind(user.workspace.id)
        .all(),
      env.DB.prepare("SELECT * FROM counseling_records WHERE workspace_id = ?")
        .bind(user.workspace.id)
        .all(),
      env.DB.prepare("SELECT * FROM counseling_types WHERE workspace_id = ?")
        .bind(user.workspace.id)
        .all(),
      env.DB.prepare("SELECT * FROM schedules WHERE workspace_id = ?")
        .bind(user.workspace.id)
        .all(),
    ]);
    const exportedAt = new Date().toISOString();
    const snapshotId = crypto.randomUUID();
    const backup = {
      format: "student-counseling-backup",
      schemaVersion: 1,
      exportedAt,
      workspace: user.workspace,
      data: {
        students: students.results,
        studentEnrollments: enrollments.results,
        counselingTypes: counselingTypes.results,
        counselingRecords: counselingRecords.results,
        schedules: schedules.results,
      },
    };
    await env.DB.prepare(
      "INSERT INTO backup_snapshots (id, workspace_id, reason, backup_json, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(
        snapshotId,
        user.workspace.id,
        "cloud_to_local_export",
        JSON.stringify(backup),
        exportedAt,
      )
      .run();
    const response = json({ ...backup, meta: { requestId } }, requestId);
    response.headers.set("X-Backup-Export-Id", snapshotId);
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="counseling-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return response;
  }

  if (pathname === "/api/v1/mode/purge-cloud" && request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    if (!["owner", "admin"].includes(user.role))
      return errorResponse(
        "FORBIDDEN",
        "데이터 삭제 권한이 없습니다.",
        requestId,
        403,
      );
    const body = await parseObject(request);
    const backupExportId =
      typeof body?.backupExportId === "string" ? body.backupExportId : "";
    if (
      body?.confirm !== "DELETE_AFTER_BACKUP" ||
      !/^[0-9a-f-]{36}$/i.test(backupExportId)
    )
      return errorResponse(
        "CONFIRMATION_REQUIRED",
        "백업 확인 후에만 클라우드 데이터를 삭제할 수 있습니다.",
        requestId,
        400,
      );
    const snapshot = await env.DB.prepare(
      "SELECT id FROM backup_snapshots WHERE id = ? AND workspace_id = ? AND reason = ?",
    )
      .bind(backupExportId, user.workspace.id, "cloud_to_local_export")
      .first();
    if (!snapshot)
      return errorResponse(
        "BACKUP_REQUIRED",
        "최근에 생성한 전환 백업을 먼저 다운로드해 주세요.",
        requestId,
        400,
      );
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM counseling_record_tags WHERE counseling_record_id IN (SELECT id FROM counseling_records WHERE workspace_id = ?)",
      ).bind(user.workspace.id),
      env.DB.prepare(
        "DELETE FROM student_tags WHERE student_id IN (SELECT id FROM students WHERE workspace_id = ?)",
      ).bind(user.workspace.id),
      env.DB.prepare("DELETE FROM attachments WHERE workspace_id = ?").bind(
        user.workspace.id,
      ),
      env.DB.prepare("DELETE FROM schedules WHERE workspace_id = ?").bind(
        user.workspace.id,
      ),
      env.DB.prepare(
        "DELETE FROM counseling_records WHERE workspace_id = ?",
      ).bind(user.workspace.id),
      env.DB.prepare(
        "DELETE FROM student_enrollments WHERE workspace_id = ?",
      ).bind(user.workspace.id),
      env.DB.prepare("DELETE FROM students WHERE workspace_id = ?").bind(
        user.workspace.id,
      ),
      env.DB.prepare("DELETE FROM tags WHERE workspace_id = ?").bind(
        user.workspace.id,
      ),
      env.DB.prepare(
        "DELETE FROM counseling_types WHERE workspace_id = ?",
      ).bind(user.workspace.id),
      env.DB.prepare(
        "INSERT INTO counseling_types (id, workspace_id, name, color, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?), (?, ?, ?, ?, ?, 1, ?, ?), (?, ?, ?, ?, ?, 1, ?, ?), (?, ?, ?, ?, ?, 1, ?, ?), (?, ?, ?, ?, ?, 1, ?, ?), (?, ?, ?, ?, ?, 1, ?, ?)",
      ).bind(
        "00000000-0000-4000-8000-000000000101",
        user.workspace.id,
        "학교생활",
        "#00AFAE",
        10,
        now,
        now,
        "00000000-0000-4000-8000-000000000102",
        user.workspace.id,
        "학업·진로",
        "#2563EB",
        20,
        now,
        now,
        "00000000-0000-4000-8000-000000000103",
        user.workspace.id,
        "교우관계",
        "#7C3AED",
        30,
        now,
        now,
        "00000000-0000-4000-8000-000000000104",
        user.workspace.id,
        "정서·생활",
        "#E11D48",
        40,
        now,
        now,
        "00000000-0000-4000-8000-000000000105",
        user.workspace.id,
        "보호자 상담",
        "#D97706",
        50,
        now,
        now,
        "00000000-0000-4000-8000-000000000106",
        user.workspace.id,
        "기타",
        "#4B5563",
        60,
        now,
        now,
      ),
      env.DB.prepare("DELETE FROM audit_logs WHERE workspace_id = ?").bind(
        user.workspace.id,
      ),
      env.DB.prepare(
        "DELETE FROM backup_snapshots WHERE workspace_id = ?",
      ).bind(user.workspace.id),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        user.workspace.id,
        "workspace",
        user.workspace.id,
        "cloud_data_purged_after_local_backup",
        JSON.stringify({ backupExportId }),
        now,
      ),
    ]);
    return json({ data: { purged: true }, meta: { requestId } }, requestId);
  }

  if (
    (pathname === "/api/v1/backup/validate" ||
      pathname === "/api/v1/backup/restore") &&
    request.method === "POST"
  ) {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const body = await parseObject(request);
    const data = isRecord(body?.data) ? body.data : null;
    const students = Array.isArray(data?.students)
      ? data.students.filter(isRecord)
      : null;
    const enrollments = Array.isArray(data?.studentEnrollments)
      ? data.studentEnrollments.filter(isRecord)
      : null;
    const counselingTypes = Array.isArray(data?.counselingTypes)
      ? data.counselingTypes.filter(isRecord)
      : [];
    const records = Array.isArray(data?.counselingRecords)
      ? data.counselingRecords.filter(isRecord)
      : null;
    const schedules = Array.isArray(data?.schedules)
      ? data.schedules.filter(isRecord)
      : null;
    const uuid = /^[0-9a-f-]{36}$/i;
    const valid =
      body?.format === "student-counseling-backup" &&
      body?.schemaVersion === 1 &&
      students !== null &&
      enrollments !== null &&
      records !== null &&
      schedules !== null &&
      students.length <= 5000 &&
      records.length <= 20000 &&
      schedules.length <= 10000 &&
      [...students, ...enrollments, ...records, ...schedules].every(
        (row) => typeof row.id === "string" && uuid.test(row.id),
      );
    if (!valid)
      return errorResponse(
        "INVALID_BACKUP",
        "지원하지 않거나 손상된 백업 파일입니다.",
        requestId,
        400,
      );
    const counts = {
      students: students.length,
      enrollments: enrollments.length,
      counselingTypes: counselingTypes.length,
      counselingRecords: records.length,
      schedules: schedules.length,
    };
    if (pathname.endsWith("/validate"))
      return json(
        { data: { valid: true, counts }, meta: { requestId } },
        requestId,
      );
    if (body?.confirm !== "RESTORE")
      return errorResponse(
        "CONFIRMATION_REQUIRED",
        "복원 확인값이 필요합니다.",
        requestId,
        400,
      );

    const [
      currentStudents,
      currentEnrollments,
      currentRecords,
      currentSchedules,
    ] = await Promise.all([
      env.DB.prepare("SELECT * FROM students WHERE workspace_id = ?")
        .bind(user.workspace.id)
        .all(),
      env.DB.prepare("SELECT * FROM student_enrollments WHERE workspace_id = ?")
        .bind(user.workspace.id)
        .all(),
      env.DB.prepare("SELECT * FROM counseling_records WHERE workspace_id = ?")
        .bind(user.workspace.id)
        .all(),
      env.DB.prepare("SELECT * FROM schedules WHERE workspace_id = ?")
        .bind(user.workspace.id)
        .all(),
    ]);
    const now = new Date().toISOString();
    const existingTypes = await env.DB.prepare(
      "SELECT id, name FROM counseling_types WHERE workspace_id = ?",
    )
      .bind(user.workspace.id)
      .all<{ id: string; name: string }>();
    const typeIdBySourceId = new Map<string, string>();
    const existingTypeByName = new Map(
      existingTypes.results.map((type) => [type.name, type.id]),
    );
    for (const type of existingTypes.results)
      typeIdBySourceId.set(type.id, type.id);
    const snapshot = JSON.stringify({
      format: "student-counseling-backup",
      schemaVersion: 1,
      exportedAt: now,
      workspace: user.workspace,
      data: {
        students: currentStudents.results,
        studentEnrollments: currentEnrollments.results,
        counselingRecords: currentRecords.results,
        schedules: currentSchedules.results,
      },
    });
    const statements = [
      env.DB.prepare(
        "INSERT INTO backup_snapshots (id, workspace_id, reason, backup_json, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        user.workspace.id,
        "before_restore",
        snapshot,
        now,
      ),
    ];
    for (const type of counselingTypes) {
      const sourceId = typeof type.id === "string" ? type.id : "";
      const name = typeof type.name === "string" ? type.name.trim() : "";
      if (!sourceId || !name) continue;
      const existingId = existingTypeByName.get(name);
      if (existingId) {
        typeIdBySourceId.set(sourceId, existingId);
        continue;
      }
      typeIdBySourceId.set(sourceId, sourceId);
      statements.push(
        env.DB.prepare(
          "INSERT INTO counseling_types (id, workspace_id, name, color, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          sourceId,
          user.workspace.id,
          name,
          typeof type.color === "string" ? type.color : null,
          Number.isInteger(type.sort_order) ? type.sort_order : 999,
          Number(type.is_active ?? 1),
          typeof type.created_at === "string" ? type.created_at : now,
          typeof type.updated_at === "string" ? type.updated_at : now,
        ),
      );
    }
    for (const row of students)
      statements.push(
        env.DB.prepare(
          `INSERT INTO students (id, workspace_id, name, phone, parent_phone, photo_key, memo, is_favorite, status, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, parent_phone=excluded.parent_phone, photo_key=excluded.photo_key, memo=excluded.memo, is_favorite=excluded.is_favorite, status=excluded.status, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at WHERE workspace_id=?`,
        ).bind(
          row.id,
          user.workspace.id,
          row.name,
          row.phone ?? null,
          row.parent_phone ?? null,
          row.photo_key ?? null,
          row.memo ?? null,
          Number(row.is_favorite ?? 0),
          row.status ?? "active",
          row.created_at ?? now,
          row.updated_at ?? now,
          row.deleted_at ?? null,
          user.workspace.id,
        ),
      );
    for (const row of enrollments)
      statements.push(
        env.DB.prepare(
          `INSERT INTO student_enrollments (id, workspace_id, student_id, school_year, grade, class_no, student_no, enrollment_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET school_year=excluded.school_year, grade=excluded.grade, class_no=excluded.class_no, student_no=excluded.student_no, enrollment_status=excluded.enrollment_status, updated_at=excluded.updated_at WHERE workspace_id=?`,
        ).bind(
          row.id,
          user.workspace.id,
          row.student_id,
          row.school_year,
          row.grade ?? null,
          row.class_no ?? null,
          row.student_no ?? null,
          row.enrollment_status ?? "enrolled",
          row.created_at ?? now,
          row.updated_at ?? now,
          user.workspace.id,
        ),
      );
    for (const row of records)
      statements.push(
        env.DB.prepare(
          `INSERT INTO counseling_records (id, workspace_id, student_id, counseling_type_id, counseling_date, counseling_time, summary, content, status, follow_up_date, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET student_id=excluded.student_id, counseling_date=excluded.counseling_date, counseling_time=excluded.counseling_time, summary=excluded.summary, content=excluded.content, status=excluded.status, follow_up_date=excluded.follow_up_date, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at WHERE workspace_id=?`,
        ).bind(
          row.id,
          user.workspace.id,
          row.student_id,
          typeof row.counseling_type_id === "string"
            ? (typeIdBySourceId.get(row.counseling_type_id) ?? null)
            : null,
          row.counseling_date,
          row.counseling_time ?? null,
          row.summary ?? "",
          row.content ?? "",
          row.status ?? "normal",
          row.follow_up_date ?? null,
          row.created_at ?? now,
          row.updated_at ?? now,
          row.deleted_at ?? null,
          user.workspace.id,
        ),
      );
    for (const row of schedules)
      statements.push(
        env.DB.prepare(
          `INSERT INTO schedules (id, workspace_id, student_id, counseling_type_id, scheduled_date, scheduled_time, note, status, counseling_record_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET student_id=excluded.student_id, scheduled_date=excluded.scheduled_date, scheduled_time=excluded.scheduled_time, note=excluded.note, status=excluded.status, counseling_record_id=excluded.counseling_record_id, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at WHERE workspace_id=?`,
        ).bind(
          row.id,
          user.workspace.id,
          row.student_id,
          typeof row.counseling_type_id === "string"
            ? (typeIdBySourceId.get(row.counseling_type_id) ?? null)
            : null,
          row.scheduled_date,
          row.scheduled_time ?? null,
          row.note ?? "",
          row.status ?? "scheduled",
          row.counseling_record_id ?? null,
          row.created_at ?? now,
          row.updated_at ?? now,
          row.deleted_at ?? null,
          user.workspace.id,
        ),
      );
    statements.push(
      env.DB.prepare(
        "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        user.workspace.id,
        "backup",
        user.workspace.id,
        "restore",
        JSON.stringify(counts),
        now,
      ),
    );
    await env.DB.batch(statements);
    return json(
      { data: { restored: true, counts }, meta: { requestId } },
      requestId,
    );
  }

  if (
    (pathname === "/api/v1/import/v1/validate" ||
      pathname === "/api/v1/import/v1") &&
    request.method === "POST"
  ) {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const body = await parseObject(request);
    const legacyStudents = Array.isArray(body?.students)
      ? body.students.filter(isRecord)
      : null;
    const legacySchedules = Array.isArray(body?.schedules)
      ? body.schedules.filter(isRecord)
      : [];
    if (
      !legacyStudents ||
      legacyStudents.length > 5000 ||
      legacySchedules.length > 10000 ||
      legacyStudents.some(
        (row) => typeof row.name !== "string" || !row.name.trim(),
      )
    )
      return errorResponse(
        "INVALID_V1_BACKUP",
        "V1 백업 구조를 확인해주세요.",
        requestId,
        400,
      );
    const historyCount = legacyStudents.reduce(
      (count, row) =>
        count +
        (Array.isArray(row.counselingHistory)
          ? row.counselingHistory.length
          : 0),
      0,
    );
    const counts = {
      students: legacyStudents.length,
      counselingRecords: historyCount,
      schedules: legacySchedules.length,
    };
    if (pathname.endsWith("/validate"))
      return json(
        { data: { valid: true, version: 1, counts }, meta: { requestId } },
        requestId,
      );
    if (body?.confirm !== "IMPORT")
      return errorResponse(
        "CONFIRMATION_REQUIRED",
        "가져오기 확인값이 필요합니다.",
        requestId,
        400,
      );
    const now = new Date().toISOString();
    const uuid = /^[0-9a-f-]{36}$/i;
    const idMap = new Map<string, string>();
    const statements = [];
    for (const row of legacyStudents) {
      const oldId = typeof row.id === "string" ? row.id : crypto.randomUUID();
      const studentId = uuid.test(oldId) ? oldId : crypto.randomUUID();
      idMap.set(oldId, studentId);
      statements.push(
        env.DB.prepare(
          "INSERT OR IGNORE INTO students (id, workspace_id, name, phone, parent_phone, memo, is_favorite, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          studentId,
          user.workspace.id,
          String(row.name).trim(),
          row.phone ?? null,
          row.parentPhone ?? null,
          row.memo ?? null,
          Number(Boolean(row.isFavorite)),
          ["active", "graduated", "transferred", "inactive"].includes(
            String(row.status),
          )
            ? row.status
            : "active",
          now,
          now,
        ),
      );
      statements.push(
        env.DB.prepare(
          "INSERT OR IGNORE INTO student_enrollments (id, workspace_id, student_id, school_year, grade, class_no, student_no, created_at, updated_at) VALUES (?, ?, ?, 2026, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          user.workspace.id,
          studentId,
          optionalInteger(row.grade, 1, 12) ?? null,
          optionalInteger(row.classNum, 1, 99) ?? null,
          optionalInteger(row.studentNum, 1, 999) ?? null,
          now,
          now,
        ),
      );
      const history = Array.isArray(row.counselingHistory)
        ? row.counselingHistory.filter(isRecord)
        : [];
      for (const record of history) {
        const date =
          typeof record.date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(record.date)
            ? record.date
            : now.slice(0, 10);
        const summary =
          typeof record.summary === "string" && record.summary.trim()
            ? record.summary.trim().slice(0, 500)
            : "이전 상담 기록";
        const recordStatus = [
          "normal",
          "monitoring",
          "follow_up",
          "in_progress",
          "completed",
        ].includes(String(record.status))
          ? record.status
          : "normal";
        statements.push(
          env.DB.prepare(
            "INSERT INTO counseling_records (id, workspace_id, student_id, counseling_date, counseling_time, summary, content, status, follow_up_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).bind(
            crypto.randomUUID(),
            user.workspace.id,
            studentId,
            date,
            typeof record.time === "string" ? record.time : null,
            summary,
            typeof record.content === "string"
              ? record.content.slice(0, 50_000)
              : "",
            recordStatus,
            typeof record.followUpDate === "string"
              ? record.followUpDate
              : null,
            now,
            now,
          ),
        );
      }
    }
    for (const row of legacySchedules) {
      const mappedStudent =
        typeof row.studentId === "string"
          ? idMap.get(row.studentId)
          : undefined;
      const date = typeof row.date === "string" ? row.date : row.scheduledDate;
      if (
        !mappedStudent ||
        typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
      )
        continue;
      statements.push(
        env.DB.prepare(
          "INSERT INTO schedules (id, workspace_id, student_id, scheduled_date, scheduled_time, note, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          user.workspace.id,
          mappedStudent,
          date,
          typeof row.time === "string" ? row.time : null,
          typeof row.note === "string" ? row.note.slice(0, 1000) : "",
          ["scheduled", "completed", "cancelled"].includes(String(row.status))
            ? row.status
            : "scheduled",
          now,
          now,
        ),
      );
    }
    statements.push(
      env.DB.prepare(
        "INSERT INTO audit_logs (id, workspace_id, entity_type, entity_id, action, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        user.workspace.id,
        "import",
        user.workspace.id,
        "v1_import",
        JSON.stringify(counts),
        now,
      ),
    );
    await env.DB.batch(statements);
    return json(
      { data: { imported: true, counts }, meta: { requestId } },
      requestId,
    );
  }

  if (pathname === "/api/v1/integrity" && request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return errorResponse(
        "UNAUTHENTICATED",
        "로그인이 필요합니다.",
        requestId,
        401,
      );
    const [
      orphanCounseling,
      orphanSchedules,
      missingEnrollment,
      incompleteCompleted,
    ] = await Promise.all([
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM counseling_records c LEFT JOIN students s ON s.id = c.student_id WHERE c.workspace_id = ? AND s.id IS NULL",
      )
        .bind(user.workspace.id)
        .first<{ count: number }>(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM schedules sc LEFT JOIN students s ON s.id = sc.student_id WHERE sc.workspace_id = ? AND s.id IS NULL",
      )
        .bind(user.workspace.id)
        .first<{ count: number }>(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM students s LEFT JOIN student_enrollments e ON e.student_id=s.id AND e.school_year=2026 WHERE s.workspace_id=? AND s.deleted_at IS NULL AND s.status='active' AND e.id IS NULL",
      )
        .bind(user.workspace.id)
        .first<{ count: number }>(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM schedules WHERE workspace_id=? AND status='completed' AND counseling_record_id IS NULL",
      )
        .bind(user.workspace.id)
        .first<{ count: number }>(),
    ]);
    const issues = {
      orphanCounseling: orphanCounseling?.count ?? 0,
      orphanSchedules: orphanSchedules?.count ?? 0,
      missingEnrollment: missingEnrollment?.count ?? 0,
      incompleteCompletedSchedules: incompleteCompleted?.count ?? 0,
    };
    return json(
      {
        data: {
          issues,
          healthy: Object.values(issues).every((count) => count === 0),
        },
        meta: { requestId },
      },
      requestId,
    );
  }

  return errorResponse(
    "NOT_FOUND",
    "요청한 API를 찾을 수 없습니다.",
    requestId,
    404,
  );
}

interface ReminderRow {
  schedule_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendScheduleReminders(env: Env) {
  if (
    env.APP_ENV !== "production" ||
    !env.VAPID_PUBLIC_KEY ||
    !env.VAPID_PRIVATE_KEY ||
    !env.VAPID_SUBJECT
  ) return;

  const now = new Date();
  const windowStart = new Date(now.getTime() + 55 * 60_000).toISOString();
  const windowEnd = new Date(now.getTime() + 65 * 60_000).toISOString();
  const reminders = await env.DB.prepare(
    `SELECT schedules.id AS schedule_id, push_subscriptions.id AS subscription_id,
      push_subscriptions.endpoint, push_subscriptions.p256dh, push_subscriptions.auth
     FROM schedules
     INNER JOIN push_subscriptions ON push_subscriptions.workspace_id = schedules.workspace_id
     LEFT JOIN schedule_reminder_deliveries
       ON schedule_reminder_deliveries.schedule_id = schedules.id
       AND schedule_reminder_deliveries.subscription_id = push_subscriptions.id
     WHERE schedules.status = 'scheduled' AND schedules.deleted_at IS NULL
       AND schedules.scheduled_time IS NOT NULL
       AND datetime(schedules.scheduled_date || 'T' || schedules.scheduled_time || ':00+09:00')
         BETWEEN datetime(?) AND datetime(?)
       AND schedule_reminder_deliveries.schedule_id IS NULL`,
  ).bind(windowStart, windowEnd).all<ReminderRow>();

  await Promise.all(reminders.results.map(async (reminder) => {
    const subscription: PushSubscription = {
      endpoint: reminder.endpoint,
      expirationTime: null,
      keys: { p256dh: reminder.p256dh, auth: reminder.auth },
    };
    try {
      const payload = await buildPushPayload(
        { data: { title: "상담 일정 알림", body: REMINDER_MESSAGE }, options: { ttl: 3_600, urgency: "high" } },
        subscription,
        { subject: env.VAPID_SUBJECT!, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! },
      );
      const response = await fetch(reminder.endpoint, payload);
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(reminder.subscription_id).run();
        return;
      }
      if (!response.ok) return;
      await env.DB.prepare(
        "INSERT OR IGNORE INTO schedule_reminder_deliveries (schedule_id, subscription_id, sent_at) VALUES (?, ?, ?)",
      ).bind(reminder.schedule_id, reminder.subscription_id, now.toISOString()).run();
    } catch {
      // Do not log endpoints or schedule data. A later cron run can retry safely.
    }
  }));
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const pathname = new URL(request.url).pathname;

    if (pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, requestId);
      } catch {
        return errorResponse(
          "INTERNAL_ERROR",
          "요청을 처리하지 못했습니다.",
          requestId,
          500,
        );
      }
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request), requestId);
  },
  async scheduled(
    _event: unknown,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    ctx.waitUntil(sendScheduleReminders(env));
  },
};

export default worker;
