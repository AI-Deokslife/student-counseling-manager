import { z } from "zod";
import { localApi } from "./localDb";

export type AppMode = "cloud" | "local";

const modeStorageKey = "student-counseling-data-mode";

export function getAppMode(): AppMode {
  const stored = localStorage.getItem(modeStorageKey);
  if (stored === "cloud") return "cloud";
  return "local";
}

export function setAppMode(mode: AppMode) {
  if (mode === "cloud") void localApi.logout();
  localStorage.setItem(modeStorageKey, mode);
  window.dispatchEvent(new Event("student-counseling-mode-change"));
}

const responseMetaSchema = z.object({ requestId: z.string().uuid() });

const healthResponseSchema = z.object({
  data: z.object({
    status: z.literal("ok"),
    appVersion: z.string(),
    database: z.enum(["ok", "unavailable"]),
    environment: z.enum(["local", "preview", "production"]),
  }),
  meta: responseMetaSchema,
});

const meResponseSchema = z.object({
  data: z.object({
    email: z.string().email(),
    name: z.string().nullable(),
    role: z.enum(["owner", "admin", "teacher", "readonly"]),
    workspace: z.object({ id: z.string().uuid(), name: z.string() }),
  }),
  meta: responseMetaSchema,
});

export type HealthStatus = z.infer<typeof healthResponseSchema>["data"];
export type CurrentUser = z.infer<typeof meResponseSchema>["data"];

export interface StudentSummary {
  id: string;
  name: string;
  school_year: number | null;
  grade: number | null;
  class_no: number | null;
  student_no: number | null;
  is_favorite: number;
  status: string;
  updated_at: string;
}

export interface StudentDetail extends StudentSummary {
  phone: string | null;
  parent_phone: string | null;
  memo: string | null;
}

export interface CounselingSummary {
  id: string;
  student_id: string;
  student_name: string;
  counseling_type_id: string | null;
  counseling_type_name: string | null;
  counseling_type_color: string | null;
  counseling_date: string;
  summary: string;
  content: string;
  status: string;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CounselingType {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
}

export interface DashboardStats {
  students: number;
  thisWeekCounseling: number;
  todayCounseling: number;
  followUpRequired: number;
}

export interface DashboardData {
  stats: DashboardStats;
  todayCounseling: Array<{
    id: string;
    student_name: string;
    counseling_time: string | null;
    summary: string;
  }>;
  followUps: Array<{
    id: string;
    student_name: string;
    summary: string;
    follow_up_date: string;
  }>;
}

export interface TrashData {
  students: Array<{ id: string; name: string; deleted_at: string }>;
  counseling: Array<{
    id: string;
    student_name: string;
    summary: string;
    deleted_at: string;
  }>;
}

export interface StudentImportRow {
  name: string;
  grade: number | null;
  classNo: number | null;
  studentNo: number | null;
}

export interface StudentImportResult {
  imported: number;
  skipped: number;
  skippedRows: number[];
}

export interface ScheduleSummary {
  id: string;
  student_id: string;
  student_name: string;
  scheduled_date: string;
  scheduled_time: string | null;
  note: string;
  status: "scheduled" | "completed" | "cancelled";
}

async function request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return schema.parse(await response.json());
}

const remoteApi = {
  health: async () => (await request("/health", healthResponseSchema)).data,
  me: async () => (await request("/me", meResponseSchema)).data,
  login: async (username: string, password: string) => {
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "아이디 또는 비밀번호가 올바르지 않습니다."
          : "로그인할 수 없습니다. 잠시 후 다시 시도해주세요.",
      );
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await fetch("/api/v1/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("현재 비밀번호가 올바르지 않습니다.");
      if (response.status === 400) throw new Error("새 비밀번호는 8자 이상이어야 하며 현재 비밀번호와 달라야 합니다.");
      throw new Error("비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  },
  logout: async () => {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: { Accept: "application/json" },
    });
  },
  students: async (): Promise<StudentSummary[]> => {
    const response = await fetch("/api/v1/students", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("학생 목록을 불러오지 못했습니다.");
    return ((await response.json()) as { data: StudentSummary[] }).data;
  },
  student: async (id: string): Promise<StudentDetail> => {
    const response = await fetch(`/api/v1/students/${id}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("학생 정보를 불러오지 못했습니다.");
    return ((await response.json()) as { data: StudentDetail }).data;
  },
  createStudent: async (input: {
    name: string;
    grade: number | null;
    classNo: number | null;
    studentNo: number | null;
  }) => {
    const response = await fetch("/api/v1/students", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!response.ok)
      throw new Error("학생을 등록하지 못했습니다. 입력값을 확인해주세요.");
  },
  importStudents: async (
    rows: StudentImportRow[],
  ): Promise<StudentImportResult> => {
    const response = await fetch("/api/v1/students/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ rows }),
    });
    if (!response.ok)
      throw new Error(
        "학생 명단을 등록하지 못했습니다. 파일 내용을 확인해주세요.",
      );
    return ((await response.json()) as { data: StudentImportResult }).data;
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
    const response = await fetch(`/api/v1/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? "다른 곳에서 학생 정보가 수정되었습니다."
          : "학생 정보를 수정하지 못했습니다.",
      );
  },
  trashStudent: async (id: string) => {
    const response = await fetch(`/api/v1/students/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("학생을 휴지통으로 이동하지 못했습니다.");
  },
  trashStudents: async (ids: string[]) => {
    const response = await fetch("/api/v1/students/bulk-trash", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok)
      throw new Error("선택한 학생을 휴지통으로 이동하지 못했습니다.");
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
    const response = await fetch("/api/v1/counseling", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("상담 기록을 저장하지 못했습니다.");
  },
  counseling: async (): Promise<CounselingSummary[]> => {
    const response = await fetch("/api/v1/counseling", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("상담 기록을 불러오지 못했습니다.");
    return ((await response.json()) as { data: CounselingSummary[] }).data;
  },
  counselingTypes: async (): Promise<CounselingType[]> => {
    const response = await fetch("/api/v1/counseling-types", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("상담 유형을 불러오지 못했습니다.");
    return ((await response.json()) as { data: CounselingType[] }).data;
  },
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
    const response = await fetch(`/api/v1/counseling/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? "다른 곳에서 상담 기록이 수정되었습니다."
          : "상담 기록을 수정하지 못했습니다.",
      );
  },
  trashCounseling: async (id: string) => {
    const response = await fetch(`/api/v1/counseling/${id}`, {
      method: "DELETE",
    });
    if (!response.ok)
      throw new Error("상담 기록을 휴지통으로 이동하지 못했습니다.");
  },
  dashboard: async (): Promise<DashboardData> => {
    const response = await fetch("/api/v1/dashboard", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("대시보드 현황을 불러오지 못했습니다.");
    return ((await response.json()) as { data: DashboardData }).data;
  },
  schedules: async (month: string): Promise<ScheduleSummary[]> => {
    const response = await fetch(
      `/api/v1/schedules?month=${encodeURIComponent(month)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error("일정을 불러오지 못했습니다.");
    return ((await response.json()) as { data: ScheduleSummary[] }).data;
  },
  createSchedule: async (input: {
    studentId: string;
    date: string;
    time: string;
    note: string;
  }) => {
    const response = await fetch("/api/v1/schedules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("일정을 등록하지 못했습니다.");
  },
  updateSchedule: async (
    id: string,
    input: {
      date: string;
      time: string | null;
      note: string;
      status: "scheduled" | "cancelled";
    },
  ) => {
    const response = await fetch(`/api/v1/schedules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("일정을 수정하지 못했습니다.");
  },
  completeSchedule: async (
    id: string,
    input: { summary: string; content: string; status: string },
  ) => {
    const response = await fetch(`/api/v1/schedules/${id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("일정을 완료하지 못했습니다.");
  },
  search: async (filters: {
    q: string;
    from: string;
    to: string;
    status: string;
  }): Promise<CounselingSummary[]> => {
    const params = new URLSearchParams(filters);
    const response = await fetch(`/api/v1/search?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("검색하지 못했습니다.");
    return ((await response.json()) as { data: CounselingSummary[] }).data;
  },
  trash: async (): Promise<TrashData> => {
    const response = await fetch("/api/v1/trash", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("휴지통을 불러오지 못했습니다.");
    return ((await response.json()) as { data: TrashData }).data;
  },
  restoreStudent: async (id: string) => {
    const response = await fetch(`/api/v1/students/${id}/restore`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("학생을 복원하지 못했습니다.");
  },
  restoreCounseling: async (id: string) => {
    const response = await fetch(`/api/v1/counseling/${id}/restore`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("상담 기록을 복원하지 못했습니다.");
  },
  downloadBackup: async () => {
    const response = await fetch("/api/v1/backup/export", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("백업을 만들지 못했습니다.");
    return response.blob();
  },
  validateBackup: async (
    backup: unknown,
  ): Promise<{ valid: boolean; counts: Record<string, number> }> => {
    const response = await fetch("/api/v1/backup/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backup),
    });
    if (!response.ok)
      throw new Error("지원하지 않거나 손상된 백업 파일입니다.");
    return (
      (await response.json()) as {
        data: { valid: boolean; counts: Record<string, number> };
      }
    ).data;
  },
  restoreBackup: async (backup: unknown) => {
    const input =
      typeof backup === "object" && backup !== null
        ? { ...backup, confirm: "RESTORE" }
        : backup;
    const response = await fetch("/api/v1/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("백업을 복원하지 못했습니다.");
  },
  validateV1Import: async (
    backup: unknown,
  ): Promise<{ valid: boolean; counts: Record<string, number> }> => {
    const response = await fetch("/api/v1/import/v1/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backup),
    });
    if (!response.ok)
      throw new Error("지원하지 않거나 손상된 V1 백업 파일입니다.");
    return (
      (await response.json()) as {
        data: { valid: boolean; counts: Record<string, number> };
      }
    ).data;
  },
  importV1: async (backup: unknown) => {
    const input =
      typeof backup === "object" && backup !== null
        ? { ...backup, confirm: "IMPORT" }
        : backup;
    const response = await fetch("/api/v1/import/v1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("V1 백업을 가져오지 못했습니다.");
  },
  integrity: async (): Promise<{
    healthy: boolean;
    issues: Record<string, number>;
  }> => {
    const response = await fetch("/api/v1/integrity", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("데이터 검사를 실행하지 못했습니다.");
    return (
      (await response.json()) as {
        data: { healthy: boolean; issues: Record<string, number> };
      }
    ).data;
  },
};

export async function downloadCloudBackup() {
  const response = await fetch("/api/v1/backup/export", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("클라우드 백업을 만들지 못했습니다.");
  const exportId = response.headers.get("X-Backup-Export-Id");
  if (!exportId) throw new Error("전환 백업 식별자를 확인하지 못했습니다.");
  const blob = await response.blob();
  return { blob, exportId, backup: JSON.parse(await blob.text()) as unknown };
}

export async function purgeCloudData(backupExportId: string) {
  const response = await fetch("/api/v1/mode/purge-cloud", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      backupExportId,
      confirm: "DELETE_AFTER_BACKUP",
    }),
  });
  if (!response.ok) throw new Error("클라우드 데이터를 삭제하지 못했습니다.");
}

export async function uploadBackupToCloud(backup: unknown) {
  return remoteApi.restoreBackup(backup);
}

export const api = new Proxy(remoteApi, {
  get(target, property, receiver) {
    const source = getAppMode() === "local" ? localApi : target;
    return Reflect.get(source, property, receiver);
  },
}) as typeof remoteApi;
