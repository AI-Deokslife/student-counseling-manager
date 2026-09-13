import Dexie, { type Table } from "dexie";
import type {
  CounselingSummary,
  CounselingType,
  CurrentUser,
  DashboardData,
  ScheduleSummary,
  StudentDetail,
  StudentImportResult,
  StudentImportRow,
  StudentSummary,
  TrashData,
} from "./api";

const LOCAL_WORKSPACE_ID = "local-workspace";
const LOCAL_USER: CurrentUser = {
  email: "local@device.invalid",
  name: "로컬 사용자",
  role: "owner",
  workspace: { id: LOCAL_WORKSPACE_ID, name: "이 기기" },
};

const DEFAULT_TYPES: CounselingType[] = [
  {
    id: "local-type-school",
    name: "학교생활",
    color: "#00AFAE",
    sort_order: 10,
  },
  {
    id: "local-type-career",
    name: "학업·진로",
    color: "#2563EB",
    sort_order: 20,
  },
  { id: "local-type-peer", name: "교우관계", color: "#7C3AED", sort_order: 30 },
  {
    id: "local-type-emotion",
    name: "정서·생활",
    color: "#E11D48",
    sort_order: 40,
  },
  {
    id: "local-type-parent",
    name: "보호자 상담",
    color: "#D97706",
    sort_order: 50,
  },
  { id: "local-type-other", name: "기타", color: "#4B5563", sort_order: 60 },
];

interface LocalStudent {
  id: string;
  name: string;
  phone: string | null;
  parent_phone: string | null;
  memo: string | null;
  is_favorite: number;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface LocalEnrollment {
  id: string;
  student_id: string;
  school_year: number;
  grade: number | null;
  class_no: number | null;
  student_no: number | null;
  enrollment_status: string;
  created_at: string;
  updated_at: string;
}

interface LocalType extends CounselingType {
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface LocalCounseling {
  id: string;
  student_id: string;
  counseling_type_id: string | null;
  counseling_date: string;
  counseling_time: string | null;
  summary: string;
  content: string;
  status: string;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface LocalSchedule {
  id: string;
  student_id: string;
  counseling_type_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  note: string;
  status: "scheduled" | "completed" | "cancelled";
  counseling_record_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface LocalAudit {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  created_at: string;
}

interface LocalSetting {
  key: string;
  value: string;
  updated_at: string;
}

export class LocalCounselingDb extends Dexie {
  students!: Table<LocalStudent, string>;
  enrollments!: Table<LocalEnrollment, string>;
  counselingTypes!: Table<LocalType, string>;
  counselingRecords!: Table<LocalCounseling, string>;
  schedules!: Table<LocalSchedule, string>;
  auditLogs!: Table<LocalAudit, string>;
  settings!: Table<LocalSetting, string>;

  constructor() {
    super("student-counseling-manager-v2");
    this.version(1).stores({
      students: "id, name, status, is_favorite, deleted_at",
      enrollments:
        "id, student_id, school_year, [school_year+grade+class_no+student_no]",
      counselingTypes: "id, name, is_active, sort_order",
      counselingRecords:
        "id, student_id, counseling_date, status, follow_up_date, deleted_at",
      schedules: "id, student_id, scheduled_date, status, deleted_at",
      auditLogs: "id, entity_type, entity_id, created_at",
    });
    this.version(2).stores({
      settings: "key",
    });
  }
}

export const localDb = new LocalCounselingDb();

const now = () => new Date().toISOString();
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const weekBounds = (date: string) => {
  const monday = new Date(`${date}T00:00:00+09:00`);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toDate = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  return { monday: toDate(monday), sunday: toDate(sunday) };
};
const uuid = () => crypto.randomUUID();

const LOCAL_PIN_KEY = "admin-pin";
const LOCAL_PIN_ITERATIONS = 100_000;
const LOCAL_SESSION_KEY = "student-counseling-local-session";
let inMemoryLocalSession = false;

function hasLocalSession() {
  try {
    return (
      sessionStorage.getItem(LOCAL_SESSION_KEY) === "authenticated" ||
      inMemoryLocalSession
    );
  } catch {
    return inMemoryLocalSession;
  }
}

function startLocalSession() {
  inMemoryLocalSession = true;
  try {
    sessionStorage.setItem(LOCAL_SESSION_KEY, "authenticated");
  } catch {
    // 브라우저 저장소를 사용할 수 없는 환경(시크릿 모드 등)에서는 무시
  }
}

function endLocalSession() {
  inMemoryLocalSession = false;
  try {
    sessionStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    // 저장소 접근 불가 시 무시
  }
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function derivePinHash(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as unknown as BufferSource,
      iterations: LOCAL_PIN_ITERATIONS,
    },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function createPinCredential(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(pin, salt);
  return `v1:${bytesToBase64(salt)}:${hash}`;
}

async function getLocalPinCredential() {
  const stored = await localDb.settings.get(LOCAL_PIN_KEY);
  if (stored) return stored.value;

  const initialCredential = await createPinCredential("1234");
  await localDb.settings.put({
    key: LOCAL_PIN_KEY,
    value: initialCredential,
    updated_at: now(),
  });
  return initialCredential;
}

async function verifyLocalPin(pin: string, credential: string) {
  const [version, encodedSalt, expectedHash] = credential.split(":");
  if (version !== "v1" || !encodedSalt || !expectedHash) return false;

  try {
    return (await derivePinHash(pin, base64ToBytes(encodedSalt))) === expectedHash;
  } catch {
    return false;
  }
}

async function ensureTypes() {
  if ((await localDb.counselingTypes.count()) > 0) return;
  const createdAt = now();
  await localDb.counselingTypes.bulkAdd(
    DEFAULT_TYPES.map((type) => ({
      ...type,
      is_active: 1,
      created_at: createdAt,
      updated_at: createdAt,
    })),
  );
}

async function enrollmentByStudent() {
  const enrollments = await localDb.enrollments
    .where("school_year")
    .equals(2026)
    .toArray();
  return new Map(
    enrollments.map((enrollment) => [enrollment.student_id, enrollment]),
  );
}

async function studentsWithEnrollment(): Promise<StudentSummary[]> {
  const [students, enrollments] = await Promise.all([
    localDb.students.filter((student) => !student.deleted_at).toArray(),
    enrollmentByStudent(),
  ]);
  return students
    .map((student) => {
      const enrollment = enrollments.get(student.id);
      return {
        id: student.id,
        name: student.name,
        school_year: enrollment?.school_year ?? null,
        grade: enrollment?.grade ?? null,
        class_no: enrollment?.class_no ?? null,
        student_no: enrollment?.student_no ?? null,
        is_favorite: student.is_favorite,
        status: student.status,
        updated_at: student.updated_at,
      };
    })
    .sort(
      (a, b) =>
        (a.grade ?? 99) - (b.grade ?? 99) ||
        (a.class_no ?? 999) - (b.class_no ?? 999) ||
        (a.student_no ?? 9999) - (b.student_no ?? 9999) ||
        a.name.localeCompare(b.name, "ko"),
    );
}

async function counselingSummaries(records?: LocalCounseling[]) {
  await ensureTypes();
  const [source, students, types] = await Promise.all([
    records ??
      localDb.counselingRecords
        .filter((record) => !record.deleted_at)
        .toArray(),
    localDb.students.toArray(),
    localDb.counselingTypes.toArray(),
  ]);
  const studentById = new Map(students.map((student) => [student.id, student]));
  const typeById = new Map(types.map((type) => [type.id, type]));
  return source
    .filter((record) => !record.deleted_at)
    .map<CounselingSummary>((record) => {
      const type = record.counseling_type_id
        ? typeById.get(record.counseling_type_id)
        : null;
      return {
        ...record,
        student_name: studentById.get(record.student_id)?.name ?? "삭제된 학생",
        counseling_type_name: type?.name ?? null,
        counseling_type_color: type?.color ?? null,
      };
    })
    .sort(
      (a, b) =>
        b.counseling_date.localeCompare(a.counseling_date) ||
        b.created_at.localeCompare(a.created_at),
    );
}

function backupPayload(data: {
  students: LocalStudent[];
  studentEnrollments: LocalEnrollment[];
  counselingTypes: LocalType[];
  counselingRecords: LocalCounseling[];
  schedules: LocalSchedule[];
}) {
  return {
    format: "student-counseling-backup",
    schemaVersion: 1,
    exportedAt: now(),
    workspace: LOCAL_USER.workspace,
    data,
  };
}

function parseBackup(backup: unknown) {
  if (typeof backup !== "object" || backup === null)
    throw new Error("백업 파일 형식이 올바르지 않습니다.");
  const value = backup as {
    format?: unknown;
    schemaVersion?: unknown;
    data?: Record<string, unknown>;
  };
  const data = value.data;
  if (
    value.format !== "student-counseling-backup" ||
    value.schemaVersion !== 1 ||
    !data ||
    !Array.isArray(data.students) ||
    !Array.isArray(data.studentEnrollments) ||
    !Array.isArray(data.counselingRecords) ||
    !Array.isArray(data.schedules)
  )
    throw new Error("지원하지 않는 백업 파일입니다.");
  return data as {
    students: LocalStudent[];
    studentEnrollments: LocalEnrollment[];
    counselingTypes?: LocalType[];
    counselingRecords: LocalCounseling[];
    schedules: LocalSchedule[];
  };
}

export const localApi = {
  login: async (_username: string, password: string) => {
    if (!password) throw new Error("비밀번호를 입력해 주세요.");
    const credential = await getLocalPinCredential();
    if (!(await verifyLocalPin(password, credential))) {
      throw new Error("관리자 비밀번호가 맞지 않습니다.");
    }
    startLocalSession();
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    if (!hasLocalSession()) throw new Error("다시 로그인해 주세요.");
    if (newPassword.length < 4) {
      throw new Error("새 비밀번호는 4자 이상으로 설정해 주세요.");
    }
    if (newPassword.length > 256) {
      throw new Error("새 비밀번호는 256자 이하여야 합니다.");
    }
    const credential = await getLocalPinCredential();
    if (!(await verifyLocalPin(currentPassword, credential))) {
      throw new Error("현재 비밀번호가 맞지 않습니다.");
    }
    if (currentPassword === newPassword) {
      throw new Error("현재 비밀번호와 다른 비밀번호를 입력해 주세요.");
    }
    await localDb.settings.put({
      key: LOCAL_PIN_KEY,
      value: await createPinCredential(newPassword),
      updated_at: now(),
    });
  },
  health: async () => ({
    status: "ok" as const,
    appVersion: "0.1.0",
    database: "ok" as const,
    environment: "local" as const,
  }),
  me: async () => {
    if (!hasLocalSession()) throw new Error("LOCAL_UNAUTHENTICATED");
    return LOCAL_USER;
  },
  logout: async () => {
    endLocalSession();
  },
  students: studentsWithEnrollment,
  student: async (id: string): Promise<StudentDetail> => {
    const student = await localDb.students.get(id);
    if (!student || student.deleted_at)
      throw new Error("학생 정보를 찾을 수 없습니다.");
    const enrollment = await localDb.enrollments
      .where("student_id")
      .equals(id)
      .and((row) => row.school_year === 2026)
      .first();
    return {
      id: student.id,
      name: student.name,
      phone: student.phone,
      parent_phone: student.parent_phone,
      memo: student.memo,
      school_year: enrollment?.school_year ?? null,
      grade: enrollment?.grade ?? null,
      class_no: enrollment?.class_no ?? null,
      student_no: enrollment?.student_no ?? null,
      is_favorite: student.is_favorite,
      status: student.status,
      updated_at: student.updated_at,
    };
  },
  createStudent: async (input: {
    name: string;
    grade: number | null;
    classNo: number | null;
    studentNo: number | null;
  }) => {
    const createdAt = now();
    const id = uuid();
    await localDb.transaction(
      "rw",
      localDb.students,
      localDb.enrollments,
      async () => {
        await localDb.students.add({
          id,
          name: input.name.trim(),
          phone: null,
          parent_phone: null,
          memo: null,
          is_favorite: 0,
          status: "active",
          created_at: createdAt,
          updated_at: createdAt,
          deleted_at: null,
        });
        await localDb.enrollments.add({
          id: uuid(),
          student_id: id,
          school_year: 2026,
          grade: input.grade,
          class_no: input.classNo,
          student_no: input.studentNo,
          enrollment_status: "enrolled",
          created_at: createdAt,
          updated_at: createdAt,
        });
      },
    );
  },
  importStudents: async (
    rows: StudentImportRow[],
  ): Promise<StudentImportResult> => {
    const existing = await studentsWithEnrollment();
    const keys = new Set(
      existing.map(
        (student) =>
          `${student.grade}:${student.class_no}:${student.student_no}`,
      ),
    );
    const accepted: StudentImportRow[] = [];
    const skippedRows: number[] = [];
    rows.forEach((row, index) => {
      const key = `${row.grade}:${row.classNo}:${row.studentNo}`;
      if (keys.has(key)) skippedRows.push(index + 2);
      else {
        keys.add(key);
        accepted.push(row);
      }
    });
    const createdAt = now();
    await localDb.transaction(
      "rw",
      localDb.students,
      localDb.enrollments,
      async () => {
        for (const row of accepted) {
          const id = uuid();
          await localDb.students.add({
            id,
            name: row.name.trim(),
            phone: null,
            parent_phone: null,
            memo: null,
            is_favorite: 0,
            status: "active",
            created_at: createdAt,
            updated_at: createdAt,
            deleted_at: null,
          });
          await localDb.enrollments.add({
            id: uuid(),
            student_id: id,
            school_year: 2026,
            grade: row.grade,
            class_no: row.classNo,
            student_no: row.studentNo,
            enrollment_status: "enrolled",
            created_at: createdAt,
            updated_at: createdAt,
          });
        }
      },
    );
    return {
      imported: accepted.length,
      skipped: skippedRows.length,
      skippedRows,
    };
  },
  updateStudent: async (
    id: string,
    input: {
      name: string;
      phone?: string;
      parentPhone?: string;
      memo?: string;
      favorite: boolean;
      status: string;
      updatedAt: string;
    },
  ) => {
    const current = await localDb.students.get(id);
    if (!current || current.updated_at !== input.updatedAt)
      throw new Error("다른 곳에서 학생 정보가 수정되었습니다.");
    await localDb.students.update(id, {
      name: input.name.trim(),
      phone: input.phone ?? null,
      parent_phone: input.parentPhone ?? null,
      memo: input.memo ?? null,
      is_favorite: Number(input.favorite),
      status: input.status,
      updated_at: now(),
    });
  },
  trashStudent: async (id: string) =>
    localDb.students.update(id, { deleted_at: now(), updated_at: now() }),
  trashStudents: async (ids: string[]) => {
    const updatedAt = now();
    await localDb.transaction("rw", localDb.students, async () => {
      await Promise.all(
        ids.map((id) =>
          localDb.students.update(id, {
            deleted_at: updatedAt,
            updated_at: updatedAt,
          }),
        ),
      );
    });
  },
  restoreStudent: async (id: string) =>
    localDb.students.update(id, { deleted_at: null, updated_at: now() }),
  counselingTypes: async (): Promise<CounselingType[]> => {
    await ensureTypes();
    return (
      await localDb.counselingTypes
        .filter((type) => type.is_active === 1)
        .toArray()
    )
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((type) => ({
        id: type.id,
        name: type.name,
        color: type.color,
        sort_order: type.sort_order,
      }));
  },
  createCounseling: async (input: {
    studentId: string;
    counselingTypeId: string;
    date: string;
    summary: string;
    content: string;
    status: string;
    followUpDate?: string | null;
  }) => {
    const createdAt = now();
    await localDb.counselingRecords.add({
      id: uuid(),
      student_id: input.studentId,
      counseling_type_id: input.counselingTypeId,
      counseling_date: input.date,
      counseling_time: null,
      summary: input.summary.trim(),
      content: input.content.trim(),
      status: input.status,
      follow_up_date: input.followUpDate ?? null,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    });
  },
  counseling: async () => counselingSummaries(),
  updateCounseling: async (
    id: string,
    input: {
      summary: string;
      counselingTypeId: string;
      content: string;
      status: string;
      followUpDate: string | null;
      updatedAt: string;
    },
  ) => {
    const current = await localDb.counselingRecords.get(id);
    if (!current || current.updated_at !== input.updatedAt)
      throw new Error("다른 곳에서 상담 기록이 수정되었습니다.");
    await localDb.counselingRecords.update(id, {
      counseling_type_id: input.counselingTypeId,
      summary: input.summary.trim(),
      content: input.content.trim(),
      status: input.status,
      follow_up_date: input.followUpDate,
      updated_at: now(),
    });
  },
  trashCounseling: async (id: string) =>
    localDb.counselingRecords.update(id, {
      deleted_at: now(),
      updated_at: now(),
    }),
  restoreCounseling: async (id: string) =>
    localDb.counselingRecords.update(id, {
      deleted_at: null,
      updated_at: now(),
    }),
  dashboard: async (): Promise<DashboardData> => {
    const date = today();
    const week = weekBounds(date);
    const [students, records] = await Promise.all([
      studentsWithEnrollment(),
      counselingSummaries(),
    ]);
    const followUps = records.filter(
      (record) =>
        ["follow_up", "in_progress"].includes(record.status) &&
        record.follow_up_date,
    );
    return {
      stats: {
        students: students.length,
        thisWeekCounseling: records.filter(
          (record) =>
            record.counseling_date >= week.monday &&
            record.counseling_date <= week.sunday,
        ).length,
        todayCounseling: records.filter(
          (record) => record.counseling_date === date,
        ).length,
        followUpRequired: followUps.length,
      },
      todayCounseling: records
        .filter((record) => record.counseling_date === date)
        .map((record) => ({
          id: record.id,
          student_name: record.student_name,
          counseling_time: null,
          summary: record.summary,
        })),
      followUps: followUps
        .sort((left, right) =>
          left.follow_up_date!.localeCompare(right.follow_up_date!),
        )
        .map((record) => ({
          id: record.id,
          student_name: record.student_name,
          summary: record.summary,
          follow_up_date: record.follow_up_date!,
        })),
    };
  },
  schedules: async (month: string): Promise<ScheduleSummary[]> => {
    const [schedules, students] = await Promise.all([
      localDb.schedules
        .filter(
          (schedule) =>
            !schedule.deleted_at && schedule.scheduled_date.startsWith(month),
        )
        .toArray(),
      localDb.students.toArray(),
    ]);
    const studentById = new Map(
      students.map((student) => [student.id, student]),
    );
    return schedules
      .map((schedule) => ({
        id: schedule.id,
        student_id: schedule.student_id,
        student_name:
          studentById.get(schedule.student_id)?.name ?? "삭제된 학생",
        scheduled_date: schedule.scheduled_date,
        scheduled_time: schedule.scheduled_time,
        note: schedule.note,
        status: schedule.status,
      }))
      .sort((a, b) =>
        `${a.scheduled_date}${a.scheduled_time ?? ""}`.localeCompare(
          `${b.scheduled_date}${b.scheduled_time ?? ""}`,
        ),
      );
  },
  createSchedule: async (input: {
    studentId: string;
    date: string;
    time: string;
    note: string;
  }) => {
    const createdAt = now();
    await localDb.schedules.add({
      id: uuid(),
      student_id: input.studentId,
      counseling_type_id: null,
      scheduled_date: input.date,
      scheduled_time: input.time || null,
      note: input.note.trim(),
      status: "scheduled",
      counseling_record_id: null,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    });
  },
  updateSchedule: async (
    id: string,
    input: {
      date: string;
      time: string | null;
      note: string;
      status: "scheduled" | "cancelled";
    },
  ) =>
    localDb.schedules.update(id, {
      scheduled_date: input.date,
      scheduled_time: input.time,
      note: input.note.trim(),
      status: input.status,
      updated_at: now(),
    }),
  completeSchedule: async (
    id: string,
    input: { summary: string; content: string; status: string },
  ) => {
    await ensureTypes();
    const schedule = await localDb.schedules.get(id);
    const type = await localDb.counselingTypes.orderBy("sort_order").first();
    if (!schedule || !type) throw new Error("일정을 완료할 수 없습니다.");
    const createdAt = now();
    const counselingId = uuid();
    await localDb.transaction(
      "rw",
      localDb.schedules,
      localDb.counselingRecords,
      async () => {
        await localDb.counselingRecords.add({
          id: counselingId,
          student_id: schedule.student_id,
          counseling_type_id: schedule.counseling_type_id ?? type.id,
          counseling_date: schedule.scheduled_date,
          counseling_time: schedule.scheduled_time,
          summary: input.summary.trim(),
          content: input.content.trim(),
          status: input.status,
          follow_up_date: null,
          created_at: createdAt,
          updated_at: createdAt,
          deleted_at: null,
        });
        await localDb.schedules.update(id, {
          status: "completed",
          counseling_record_id: counselingId,
          updated_at: createdAt,
        });
      },
    );
  },
  search: async (filters: {
    q: string;
    from: string;
    to: string;
    status: string;
  }) => {
    const query = filters.q.trim().toLocaleLowerCase("ko");
    return (await counselingSummaries()).filter(
      (record) =>
        (!filters.from || record.counseling_date >= filters.from) &&
        (!filters.to || record.counseling_date <= filters.to) &&
        (!filters.status || record.status === filters.status) &&
        (!query ||
          `${record.student_name} ${record.summary} ${record.content}`
            .toLocaleLowerCase("ko")
            .includes(query)),
    );
  },
  trash: async (): Promise<TrashData> => {
    const [students, records] = await Promise.all([
      localDb.students
        .filter((student) => Boolean(student.deleted_at))
        .toArray(),
      localDb.counselingRecords
        .filter((record) => Boolean(record.deleted_at))
        .toArray(),
    ]);
    const studentById = new Map(
      (await localDb.students.toArray()).map((student) => [
        student.id,
        student,
      ]),
    );
    return {
      students: students.map((student) => ({
        id: student.id,
        name: student.name,
        deleted_at: student.deleted_at!,
      })),
      counseling: records.map((record) => ({
        id: record.id,
        student_name: studentById.get(record.student_id)?.name ?? "삭제된 학생",
        summary: record.summary,
        deleted_at: record.deleted_at!,
      })),
    };
  },
  downloadBackup: async () =>
    new Blob([JSON.stringify(await localBackup(), null, 2)], {
      type: "application/json",
    }),
  validateBackup: async (backup: unknown) => {
    const data = parseBackup(backup);
    return {
      valid: true,
      counts: {
        students: data.students.length,
        enrollments: data.studentEnrollments.length,
        counselingRecords: data.counselingRecords.length,
        schedules: data.schedules.length,
      },
    };
  },
  restoreBackup: async (backup: unknown) => importLocalBackup(backup),
  validateV1Import: async () => {
    throw new Error("로컬 모드에서는 V1 가져오기를 지원하지 않습니다.");
  },
  importV1: async () => {
    throw new Error("로컬 모드에서는 V1 가져오기를 지원하지 않습니다.");
  },
  integrity: async () => ({ healthy: true, issues: {} }),
};

export async function localBackup() {
  await ensureTypes();
  const [
    students,
    studentEnrollments,
    counselingTypes,
    counselingRecords,
    schedules,
  ] = await Promise.all([
    localDb.students.toArray(),
    localDb.enrollments.toArray(),
    localDb.counselingTypes.toArray(),
    localDb.counselingRecords.toArray(),
    localDb.schedules.toArray(),
  ]);
  return backupPayload({
    students,
    studentEnrollments,
    counselingTypes,
    counselingRecords,
    schedules,
  });
}

export async function importLocalBackup(backup: unknown) {
  const data = parseBackup(backup);
  const createdAt = now();
  const types = data.counselingTypes?.length
    ? data.counselingTypes
    : DEFAULT_TYPES.map((type) => ({
        ...type,
        is_active: 1,
        created_at: createdAt,
        updated_at: createdAt,
      }));
  await localDb.transaction(
    "rw",
    localDb.students,
    localDb.enrollments,
    localDb.counselingTypes,
    localDb.counselingRecords,
    localDb.schedules,
    async () => {
      await Promise.all([
        localDb.students.clear(),
        localDb.enrollments.clear(),
        localDb.counselingTypes.clear(),
        localDb.counselingRecords.clear(),
        localDb.schedules.clear(),
      ]);
      await localDb.students.bulkPut(data.students);
      await localDb.enrollments.bulkPut(data.studentEnrollments);
      await localDb.counselingTypes.bulkPut(types);
      await localDb.counselingRecords.bulkPut(data.counselingRecords);
      await localDb.schedules.bulkPut(data.schedules);
    },
  );
}

export async function clearLocalData() {
  await localDb.transaction(
    "rw",
    localDb.students,
    localDb.enrollments,
    localDb.counselingTypes,
    localDb.counselingRecords,
    localDb.schedules,
    async () => {
      await Promise.all([
        localDb.students.clear(),
        localDb.enrollments.clear(),
        localDb.counselingTypes.clear(),
        localDb.counselingRecords.clear(),
        localDb.schedules.clear(),
      ]);
    },
  );
}
