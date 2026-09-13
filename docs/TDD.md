# 학생상담관리 시스템 V2 — Technical Design Document

- 문서 버전: TDD v1.0
- 기준 PRD: `docs/PRD.md`
- Production: Cloudflare Workers + D1 + R2
- Source Control: GitHub
- Frontend: React + TypeScript + Vite
- Local DB: IndexedDB (Dexie)
- Cloud DB: Cloudflare D1
- Authentication: Cloudflare Access
- App Type: PWA

---

## 1. 기술 설계 목표

하나의 코드베이스에서 두 실행 모드를 지원한다.

```text
Local Edition
React PWA
    ↓
Repository Interface
    ↓
IndexedDB

Cloud Edition
React PWA
    ↓
Repository Interface
    ↓
HTTP API
    ↓
Cloudflare Worker
    ↓
D1 / R2
```

핵심 원칙:

- UI와 저장소 분리
- Domain Model 공유
- Business Rule 공유
- Local/Cloud 중복 개발 금지
- 데이터 손실 방지 우선
- DB migration source control
- AI는 선택 기능

---

## 2. 기술 스택

### Frontend

- React
- TypeScript
- Vite
- React Router
- Tailwind CSS
- TanStack Query
- Zod
- Dexie
- SheetJS 또는 동등 XLSX 라이브러리
- PWA plugin / Service Worker

### Backend

- Cloudflare Worker
- TypeScript
- D1
- R2
- Cloudflare Access
- Worker Secrets
- Optional AI Provider

---

## 3. Repository 구조

```text
student-counseling-manager/
│
├─ AGENTS.md
├─ README.md
│
├─ docs/
│  ├─ PRD.md
│  └─ TDD.md
│
├─ src/
│  ├─ app/
│  ├─ features/
│  │  ├─ dashboard/
│  │  ├─ students/
│  │  ├─ counseling/
│  │  ├─ schedules/
│  │  ├─ reports/
│  │  ├─ backup/
│  │  ├─ settings/
│  │  └─ ai/
│  ├─ components/
│  ├─ domain/
│  ├─ repositories/
│  │  ├─ interfaces/
│  │  ├─ indexeddb/
│  │  └─ api/
│  ├─ services/
│  ├─ hooks/
│  └─ lib/
│
├─ worker/
│  ├─ index.ts
│  ├─ routes/
│  ├─ services/
│  ├─ repositories/d1/
│  ├─ middleware/
│  └─ types/
│
├─ migrations/
├─ public/
├─ tests/
├─ wrangler.jsonc
├─ vite.config.ts
├─ tsconfig.json
└─ package.json
```

---

## 4. 실행 모드

```typescript
type AppMode = 'local' | 'cloud';
```

Build-time env:

```text
VITE_APP_MODE=local
```

또는:

```text
VITE_APP_MODE=cloud
```

Repository factory:

```typescript
interface Repositories {
  students: StudentRepository;
  counseling: CounselingRepository;
  schedules: ScheduleRepository;
  tags: TagRepository;
  settings: SettingsRepository;
}

function createRepositories(mode: AppMode): Repositories {
  if (mode === 'local') {
    return createIndexedDbRepositories();
  }

  return createApiRepositories();
}
```

모드 전환은 동기화 기능이 아니라 명시적 백업 이동이다.

```text
Cloud → Local: export snapshot → browser download → IndexedDB import → explicit cloud purge
Local → Cloud: IndexedDB export → Worker backup restore → switch to cloud mode
```

Cloud purge endpoint는 전환용 export snapshot ID와 `DELETE_AFTER_BACKUP` 확인값을 모두 검증한다.

---

## 5. ID 정책

주요 Entity는 UUID 사용.

```typescript
crypto.randomUUID()
```

대상:

- workspace
- user
- student
- enrollment
- counseling
- schedule
- tag
- attachment
- audit log

Local/Cloud에서 동일 형식을 사용한다.

---

## 6. 날짜 정책

업무 날짜:

```text
2026-09-13
```

상담시간:

```text
14:30
```

시스템 timestamp:

```text
2026-09-13T05:30:41.123Z
```

시스템 timestamp는 UTC ISO-8601로 저장하고 화면에서 로컬 시간대로 표시한다.

학년도:

```text
2026
```

정수형으로 관리한다.

---

## 7. Workspace

MVP가 1인용이어도 Cloud 데이터는 workspace 단위로 설계한다.

```text
Workspace
 ├─ Users
 ├─ Students
 ├─ Counseling
 └─ Settings
```

Local Edition은 고정 workspace 사용.

```text
local-workspace
```

---

# 8. D1 Schema

## 8.1 workspaces

```sql
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    current_school_year INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## 8.2 users

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    access_email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
);
```

## 8.3 workspace_members

```sql
CREATE TABLE workspace_members (
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL
        CHECK(role IN ('owner', 'admin', 'teacher', 'readonly')),
    created_at TEXT NOT NULL,

    PRIMARY KEY (workspace_id, user_id),

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);
```

## 8.4 students

```sql
CREATE TABLE students (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,

    name TEXT NOT NULL,
    phone TEXT,
    parent_phone TEXT,
    photo_key TEXT,
    memo TEXT,

    is_favorite INTEGER NOT NULL DEFAULT 0
        CHECK(is_favorite IN (0,1)),

    status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN (
            'active',
            'graduated',
            'transferred',
            'inactive'
        )),

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id)
);
```

## 8.5 student_enrollments

```sql
CREATE TABLE student_enrollments (
    id TEXT PRIMARY KEY,

    workspace_id TEXT NOT NULL,
    student_id TEXT NOT NULL,

    school_year INTEGER NOT NULL,
    grade INTEGER,
    class_no INTEGER,
    student_no INTEGER,

    enrollment_status TEXT NOT NULL DEFAULT 'enrolled'
        CHECK(enrollment_status IN (
            'enrolled',
            'graduated',
            'transferred',
            'withdrawn'
        )),

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (student_id)
        REFERENCES students(id),

    UNIQUE(student_id, school_year)
);
```

## 8.6 counseling_types

```sql
CREATE TABLE counseling_types (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,

    name TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    UNIQUE(workspace_id, name)
);
```

## 8.7 tags

```sql
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,

    name TEXT NOT NULL,
    color TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    UNIQUE(workspace_id, name)
);
```

## 8.8 student_tags

```sql
CREATE TABLE student_tags (
    student_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT NOT NULL,

    PRIMARY KEY (student_id, tag_id),

    FOREIGN KEY (student_id)
        REFERENCES students(id),

    FOREIGN KEY (tag_id)
        REFERENCES tags(id)
);
```

## 8.9 counseling_records

```sql
CREATE TABLE counseling_records (
    id TEXT PRIMARY KEY,

    workspace_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    counseling_type_id TEXT,

    counseling_date TEXT NOT NULL,
    counseling_time TEXT,

    summary TEXT,
    content TEXT,

    status TEXT NOT NULL DEFAULT 'normal'
        CHECK(status IN (
            'normal',
            'monitoring',
            'follow_up',
            'in_progress',
            'completed'
        )),

    follow_up_date TEXT,

    created_by TEXT,
    updated_by TEXT,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (student_id)
        REFERENCES students(id),

    FOREIGN KEY (counseling_type_id)
        REFERENCES counseling_types(id),

    FOREIGN KEY (created_by)
        REFERENCES users(id),

    FOREIGN KEY (updated_by)
        REFERENCES users(id)
);
```

## 8.10 counseling_record_tags

```sql
CREATE TABLE counseling_record_tags (
    counseling_record_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,

    PRIMARY KEY (counseling_record_id, tag_id),

    FOREIGN KEY (counseling_record_id)
        REFERENCES counseling_records(id),

    FOREIGN KEY (tag_id)
        REFERENCES tags(id)
);
```

## 8.11 schedules

```sql
CREATE TABLE schedules (
    id TEXT PRIMARY KEY,

    workspace_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    counseling_type_id TEXT,

    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT,

    note TEXT,

    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK(status IN (
            'scheduled',
            'completed',
            'cancelled'
        )),

    counseling_record_id TEXT,

    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (student_id)
        REFERENCES students(id),

    FOREIGN KEY (counseling_type_id)
        REFERENCES counseling_types(id),

    FOREIGN KEY (counseling_record_id)
        REFERENCES counseling_records(id)
);
```

## 8.12 attachments

```sql
CREATE TABLE attachments (
    id TEXT PRIMARY KEY,

    workspace_id TEXT NOT NULL,
    student_id TEXT,
    counseling_record_id TEXT,

    storage_key TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,

    created_by TEXT,
    created_at TEXT NOT NULL,
    deleted_at TEXT,

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (student_id)
        REFERENCES students(id),

    FOREIGN KEY (counseling_record_id)
        REFERENCES counseling_records(id)
);
```

## 8.13 audit_logs

```sql
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,

    workspace_id TEXT NOT NULL,
    user_id TEXT,

    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,

    before_json TEXT,
    after_json TEXT,

    created_at TEXT NOT NULL,

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);
```

## 8.14 workspace_settings

```sql
CREATE TABLE workspace_settings (
    workspace_id TEXT PRIMARY KEY,
    settings_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id)
);
```

---

## 9. Index

```sql
CREATE INDEX idx_students_workspace
ON students(workspace_id, deleted_at);

CREATE INDEX idx_students_favorite
ON students(workspace_id, is_favorite, deleted_at);

CREATE INDEX idx_enrollments_school_year
ON student_enrollments(
    workspace_id,
    school_year,
    grade,
    class_no
);

CREATE INDEX idx_counseling_student_date
ON counseling_records(
    student_id,
    counseling_date DESC
);

CREATE INDEX idx_counseling_workspace_date
ON counseling_records(
    workspace_id,
    counseling_date DESC
);

CREATE INDEX idx_counseling_follow_up
ON counseling_records(
    workspace_id,
    follow_up_date,
    status
);

CREATE INDEX idx_schedules_date
ON schedules(
    workspace_id,
    scheduled_date,
    status
);

CREATE INDEX idx_audit_entity
ON audit_logs(
    workspace_id,
    entity_type,
    entity_id,
    created_at DESC
);
```

---

## 10. 검색 설계

MVP에서는 FTS5를 필수로 사용하지 않는다.

초기:

```sql
WHERE summary LIKE ?
   OR content LIKE ?
```

실제 데이터가 커져 성능 문제가 확인되면 FTS5를 별도 migration으로 추가한다.

AI 자연어 검색은 SQL을 직접 생성하지 않는다.

```text
사용자 문장
→ AI SearchFilter JSON
→ Zod validation
→ 고정 Query Builder
→ D1
```

---

## 11. Prepared Statement

모든 동적 데이터는 bind 사용.

```typescript
await env.DB
  .prepare(`
    SELECT *
    FROM students
    WHERE workspace_id = ?
      AND deleted_at IS NULL
  `)
  .bind(workspaceId)
  .all();
```

문자열 interpolation으로 SQL을 만들지 않는다.

---

## 12. Transaction / Batch

여러 변경이 반드시 함께 성공해야 하는 경우 D1 `batch()`를 사용한다.

예:

```text
학생 생성
+
학적 생성
+
Audit Log
```

일정 완료:

```text
상담기록 생성
+
schedule.status = completed
+
schedule.counseling_record_id 설정
+
Audit Log
```

---

## 13. Domain Model 예시

```typescript
interface Student {
  id: string;
  name: string;

  phone?: string | null;
  parentPhone?: string | null;

  photoKey?: string | null;
  memo?: string | null;

  favorite: boolean;

  status:
    | 'active'
    | 'graduated'
    | 'transferred'
    | 'inactive';

  createdAt: string;
  updatedAt: string;
}
```

```typescript
interface CounselingRecord {
  id: string;

  studentId: string;
  counselingTypeId?: string | null;

  date: string;
  time?: string | null;

  summary: string;
  content: string;

  status:
    | 'normal'
    | 'monitoring'
    | 'follow_up'
    | 'in_progress'
    | 'completed';

  followUpDate?: string | null;

  createdAt: string;
  updatedAt: string;
}
```

---

## 14. Repository Interface

```typescript
interface StudentRepository {
  list(query: StudentListQuery): Promise<Page<StudentSummary>>;
  get(id: string): Promise<StudentDetail>;
  create(input: CreateStudentInput): Promise<Student>;
  update(id: string, input: UpdateStudentInput): Promise<Student>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}
```

```typescript
interface CounselingRepository {
  listByStudent(
    studentId: string,
    query?: CounselingQuery
  ): Promise<Page<CounselingRecord>>;

  get(id: string): Promise<CounselingRecord>;
  create(input: CreateCounselingInput): Promise<CounselingRecord>;
  update(id: string, input: UpdateCounselingInput): Promise<CounselingRecord>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}
```

---

## 15. IndexedDB Schema

DB:

```text
student-counseling-manager-v2
```

Stores:

```text
students
enrollments
counselingRecords
counselingTypes
tags
studentTags
counselingRecordTags
schedules
attachments
settings
drafts
auditLogs
```

Dexie 개념:

```typescript
db.version(1).stores({
  students:
    'id, name, status, isFavorite, deletedAt',

  enrollments:
    'id, studentId, schoolYear, [schoolYear+grade+classNo]',

  counselingRecords:
    'id, studentId, date, status, followUpDate, deletedAt',

  counselingTypes:
    'id, name, isActive',

  tags:
    'id, name, isActive',

  studentTags:
    '[studentId+tagId], studentId, tagId',

  schedules:
    'id, studentId, scheduledDate, status',

  attachments:
    'id, studentId, counselingRecordId',

  drafts:
    'id, studentId, updatedAt',

  auditLogs:
    'id, entityType, entityId, createdAt'
});
```

사진/첨부파일은 Base64가 아니라 Blob으로 저장한다.

로컬 관리자 PIN은 `settings` store의 `admin-pin` key에 salt와 PBKDF2-SHA-256 검증값으로 저장한다. 초기 PIN은 `1234`이며, 로그인 세션은 `sessionStorage`에만 유지해 같은 탭의 새로고침에는 유지되고 로그아웃 또는 탭 종료 시 제거한다. 백업 파일에는 PIN 검증값과 로그인 세션을 포함하지 않는다.

---

## 16. API Version

```text
/api/v1/
```

---

## 17. API Response

성공:

```json
{
  "data": {},
  "meta": {
    "requestId": "..."
  }
}
```

목록:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 30,
    "total": 128,
    "requestId": "..."
  }
}
```

실패:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해주세요.",
    "fields": {}
  },
  "meta": {
    "requestId": "..."
  }
}
```

---

## 18. HTTP Status

```text
200 OK
201 Created
204 No Content
400 Validation Error
401 Unauthenticated
403 Forbidden
404 Not Found
409 Conflict
413 Payload Too Large
429 Rate Limited
500 Internal Error
```

---

## 19. 핵심 API

| Method | Endpoint | 기능 |
|---|---|---|
| GET | `/api/v1/health` | 상태 확인 |
| GET | `/api/v1/me` | 사용자 정보 |
| GET | `/api/v1/counseling-types` | 활성 상담 유형 목록 |
| GET | `/api/v1/bootstrap` | 초기 설정/유형/태그 |
| GET | `/api/v1/students` | 학생 목록 |
| POST | `/api/v1/students` | 학생 등록 |
| GET | `/api/v1/students/:id` | 학생 상세 |
| PATCH | `/api/v1/students/:id` | 학생 수정 |
| DELETE | `/api/v1/students/:id` | 휴지통 이동 |
| POST | `/api/v1/students/:id/restore` | 학생 복원 |
| GET | `/api/v1/students/:id/counseling` | 학생 상담내역 |
| POST | `/api/v1/counseling` | 상담 작성 |
| PATCH | `/api/v1/counseling/:id` | 상담 수정 |
| DELETE | `/api/v1/counseling/:id` | 상담 삭제 |
| POST | `/api/v1/counseling/:id/restore` | 상담 복원 |
| GET | `/api/v1/schedules` | 일정 조회 |
| POST | `/api/v1/schedules` | 일정 작성 |
| PATCH | `/api/v1/schedules/:id` | 일정 수정 |
| POST | `/api/v1/schedules/:id/complete` | 상담 완료 |
| GET | `/api/v1/dashboard` | 대시보드 |
| GET | `/api/v1/search` | 통합검색 |
| GET | `/api/v1/trash` | 휴지통 |
| GET | `/api/v1/backup/export` | 백업 |
| POST | `/api/v1/backup/validate` | 복원 검증 |
| POST | `/api/v1/backup/restore` | 복원 |
| POST | `/api/v1/import/v1/validate` | V1 검증 |
| POST | `/api/v1/import/v1` | V1 Import |
| POST | `/api/v1/ai/summary` | 상담 정리 |
| POST | `/api/v1/ai/briefing` | 상담 브리핑 |
| POST | `/api/v1/ai/search-filter` | 자연어 검색조건 생성 |

---

## 20. 학생 목록 Query

```text
GET /api/v1/students
?schoolYear=2026
&grade=2
&classNo=3
&tag=abc
&favorite=true
&q=김민수
&page=1
&pageSize=30
```

기본 `pageSize=30`, 최대 `100`.

---

## 21. 일정 완료 처리

Request:

```text
POST /api/v1/schedules/:id/complete
```

```json
{
  "summary": "진로 관련 후속 상담",
  "content": "...",
  "status": "follow_up",
  "followUpDate": "2026-09-27"
}
```

Transaction:

1. counseling_records INSERT
2. schedules status completed
3. counseling_record_id update
4. audit_logs INSERT

---

## 22. 인증

Cloud Edition:

```text
Browser
  ↓
Cloudflare Access
  ↓
Worker
  ↓
Access identity
  ↓
users / workspace_members
  ↓
Authorization
```

앱 자체는 비밀번호를 저장하지 않는 것을 기본안으로 한다.

초기 `workers.dev` 운영 환경에서는 Cloudflare Access 설정 전까지 관리자 보조 로그인을 허용한다.

```text
관리자 아이디
+
초기 비밀번호의 bcrypt cost 12 해시 (Worker Secret)
→ HMAC 서명 세션
→ HttpOnly / Secure / SameSite=Strict Cookie
```

비밀번호 원문, salt, 세션 서명키는 Git과 D1에 저장하지 않는다. 로그인과 변경 시 DB 관리자 비밀번호는 8자 이상 256자 이하로 검증한다. 초기 해시는 Worker Secret으로 유지하고, 앱에서 변경한 비밀번호는 bcrypt cost 12 해시와 변경 시각만 `admin_credentials`에 저장하며, 해당 시각을 관리자 세션 버전에 포함해 비밀번호 변경 시 기존 관리자 세션을 무효화한다. Access가 활성화되면 Access identity를 우선 사용한다.

---

## 23. Authorization

| Role | 조회 | 입력 | 수정 | 삭제 | 설정 |
|---|---:|---:|---:|---:|---:|
| owner | O | O | O | O | O |
| admin | O | O | O | O | O |
| teacher | O | O | O | 제한 | X |
| readonly | O | X | X | X | X |

모든 Cloud query는 반드시 `workspace_id` 범위를 포함한다.

---

## 24. R2

Bucket 예:

```text
student-counseling-files-prod
student-counseling-files-preview
```

Key:

```text
workspaces/{workspaceId}/students/{studentId}/profile.webp

workspaces/{workspaceId}/counseling/{counselingId}/{attachmentId}-{filename}
```

R2는 public bucket으로 운영하지 않는다.

인증된 API를 통해 파일을 반환한다.

---

## 25. PWA Cache 정책

```text
/static/*      Cache First
index.html     Network First
/api/*         Network Only
```

Cloud Edition의 학생/상담 API 응답은 Cache Storage에 기본 저장하지 않는다.

---

## 26. PWA Update

새 Service Worker waiting:

```text
새 버전이 있습니다.
[업데이트]
```

클릭:

```text
SKIP_WAITING
→ activate
→ controllerchange
→ reload
```

작성 중 draft가 있으면 reload 전에 저장 상태를 확인한다.

`beforeinstallprompt`는 최초 로그인 화면과 대시보드에서 공통으로 감지한다. 설치가 수락되거나 standalone display mode이면 설치 버튼을 숨긴다. 새 Service Worker가 waiting 상태일 때만 업데이트 버튼을 표시하며, 업데이트 적용 뒤에는 다시 표시하지 않는다.

### Push Reminder

Cloud Edition은 기기별 Web Push 구독을 `push_subscriptions`에 저장한다. Worker Cron은 5분마다 실행하며, `Asia/Seoul` 기준으로 55~65분 뒤에 시작하는 예정 상담을 찾아 기기별로 한 번만 발송한다. VAPID 공개키·개인키와 발신자 식별자는 Worker Secret으로 관리한다. 푸시 payload에는 학생 이름, 상담 내용, 메모를 포함하지 않는다.

---

## 27. 상담 Draft

IndexedDB `drafts` store에 저장.

```typescript
interface CounselingDraft {
  id: string;
  studentId: string;
  typeId?: string;
  date: string;
  summary: string;
  content: string;
  updatedAt: string;
}
```

Debounce:

```text
500~1000ms
```

정상 저장 후 draft 삭제.

---

## 28. 백업 포맷

```json
{
  "format": "student-counseling-manager",
  "schemaVersion": 1,
  "appVersion": "2.0.0",
  "createdAt": "...",
  "workspace": {},
  "data": {
    "students": [],
    "enrollments": [],
    "counselingTypes": [],
    "tags": [],
    "studentTags": [],
    "counselingRecords": [],
    "counselingRecordTags": [],
    "schedules": []
  }
}
```

기본 백업에서 Audit Log는 선택사항.

사진/첨부파일 Full Backup은 별도 ZIP 기반 확장 기능으로 둔다.

---

## 29. 복원 순서

```text
파일 선택
→ Parse
→ format 검증
→ schemaVersion 검증
→ Entity 검증
→ Reference 검증
→ 결과 Preview
→ 현재 데이터 Backup
→ Transaction
→ 무결성 검사
→ 완료
```

---

## 30. Migration 정책

```text
migrations/
0001_initial.sql
0002_indexes.sql
0003_...
```

Local:

```bash
npx wrangler d1 migrations apply student-counseling-prod --local
```

Production:

```bash
npx wrangler d1 migrations apply student-counseling-prod --remote
```

운영 원칙:

```text
1. Backup 확인
2. Local migration test
3. Preview DB migration
4. Preview app test
5. Production migration
6. Production deploy
7. Smoke test
```

앱 배포와 destructive DB migration을 무조건 자동 결합하지 않는다.

---

## 31. wrangler.jsonc 예시

```json
{
  "$schema": "./node_modules/wrangler/config-schema.json",

  "name": "student-counseling-manager",
  "main": "./worker/index.ts",

  "compatibility_date": "2026-09-13",

  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": [
      "/api/*"
    ]
  },

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "student-counseling-prod",
      "database_id": "<PRODUCTION_DB_ID>",
      "preview_database_id": "<PREVIEW_DB_ID>",
      "migrations_dir": "migrations"
    }
  ],

  "r2_buckets": [
    {
      "binding": "FILES",
      "bucket_name": "student-counseling-files-prod"
    }
  ],

  "vars": {
    "APP_ENV": "production"
  }
}
```

---

## 32. Secret

Git 금지:

```text
AI_API_KEY
외부 API Token
```

등록:

```bash
npx wrangler secret put AI_API_KEY
```

Local:

```text
.dev.vars
```

`.gitignore`:

```text
.dev.vars
.env
.env.*
```

---

## 33. V1 Import

V1:

```json
{
  "students": [],
  "counselingTypes": [],
  "schedules": [],
  "tags": []
}
```

변환:

```text
V1 JSON
→ schema detect
→ Student
→ Enrollment
→ Counseling 분리
→ Counseling UUID 생성
→ Types mapping
→ Tags mapping
→ Schedule 변환
→ Photo 변환
→ Integrity Check
→ Commit
```

V1 counseling:

```text
date        → counseling_date
type        → counseling_type_id mapping
remarks     → summary
details     → content
status      → normal
```

---

## 34. Excel

Import:

```text
파일
→ Client Parse
→ Preview
→ Validation
→ 사용자 확인
→ Bulk Create
```

Export:

```text
API normalized data
→ Browser XLSX
→ Download
```

연락처는 기본 제외.

---

## 35. AI Architecture

```text
Browser
→ /api/v1/ai/*
→ Worker
→ PII Redaction
→ AI Provider Adapter
→ External AI API
```

AI Provider Interface:

```typescript
interface AIProvider {
  summarizeCounseling(
    input: CounselingSummaryInput
  ): Promise<CounselingSummaryResult>;

  briefStudent(
    input: StudentBriefInput
  ): Promise<StudentBriefResult>;

  parseSearchQuery(
    input: string
  ): Promise<SearchFilter>;
}
```

AI가 SQL을 생성해 D1에 직접 실행하는 구조 금지.

AI 결과는 교사가 검토 후 저장.

---

## 36. Markdown

```text
Markdown
→ Parser
→ Sanitizer
→ Render
```

raw HTML 차단.

허용 최소화:

- 제목
- 목록
- 굵게
- 기울임
- 인용

---

## 37. Validation

모든 Write 요청:

```text
Frontend Zod
+
Worker Zod
```

예:

```typescript
const CounselingCreateSchema = z.object({
  studentId: z.string().uuid(),
  date: z.string(),
  time: z.string().optional(),
  typeId: z.string().uuid().nullable(),
  summary: z.string().max(500),
  content: z.string().max(50_000),
  status: z.enum([
    'normal',
    'monitoring',
    'follow_up',
    'in_progress',
    'completed'
  ]),
  followUpDate: z.string().nullable()
});
```

---

## 38. Concurrency

PATCH 요청에 기존 `updatedAt` 포함.

SQL:

```sql
UPDATE counseling_records
SET ...
WHERE id = ?
  AND updated_at = ?
```

변경 row 0:

```text
409 Conflict
```

UI:

```text
다른 기기에서 이 기록이 수정되었습니다.
[최신 내용 불러오기]
```

---

## 39. Soft Delete

```sql
UPDATE counseling_records
SET
  deleted_at = ?,
  updated_at = ?
WHERE
  id = ?
  AND workspace_id = ?
  AND deleted_at IS NULL;
```

복원:

```sql
UPDATE counseling_records
SET
  deleted_at = NULL,
  updated_at = ?
WHERE
  id = ?
  AND workspace_id = ?;
```

영구삭제는 관리자 휴지통에서만 허용.

---

## 40. Dashboard API

```text
GET /api/v1/dashboard?schoolYear=2026
```

응답 예:

```json
{
  "todayCounseling": [],
  "followUps": [],
  "stats": {
    "students": 132,
    "thisWeekCounseling": 18,
    "todayCounseling": 3,
    "followUpRequired": 7
  },
  "monthlyTrend": [],
  "typeStats": []
}
```

---

## 41. 성능 목표

가정:

```text
학생           <= 1,000
상담           <= 100,000
일정           <= 20,000
Audit Log      <= 500,000
```

목표:

```text
학생 목록      < 1초
학생 상세      < 1초
상담 저장      < 1초
일정 저장      < 1초
검색           < 2초
Dashboard      < 2초
```

대량 목록은 pagination 사용.

---

## 42. Logging

민감정보 logging 금지.

금지:

```typescript
console.log(requestBody);
```

허용:

```typescript
console.log({
  requestId,
  route,
  method,
  status,
  duration
});
```

---

## 43. Request ID

```typescript
const requestId = crypto.randomUUID();
```

Response Header:

```text
X-Request-Id
```

---

## 44. Error Mapping

```text
ValidationError → 400
AuthError       → 401
PermissionError → 403
NotFoundError   → 404
ConflictError   → 409
UnknownError    → 500
```

500에서 stack trace를 사용자에게 노출하지 않는다.

---

## 45. Security Headers

최소:

```text
Content-Security-Policy
X-Content-Type-Options: nosniff
Referrer-Policy
Permissions-Policy
```

Runtime CDN script 의존을 최소화하고 build bundle 사용.

---

## 46. Rate Limit

특히 다음 endpoint 보호:

- AI
- Backup Restore
- File Upload
- Import

---

## 47. 테스트

### Unit

- Validation
- Date utility
- Backup parser
- V1 migration converter
- Repository mapping
- AI SearchFilter parser

### Contract Test

IndexedDB / D1 Repository에 동일 시나리오 적용:

- create
- get
- update
- trash
- restore

### Worker Integration

- migration
- seed
- request
- response
- DB state 검증

### E2E

- 로그인
- 학생 등록
- 상담 기록
- 상담 수정
- 일정
- 일정 완료
- 후속상담
- 검색
- Excel Export
- 휴지통
- 복원
- 백업

### PWA

- 설치
- 설치버튼 숨김
- offline shell
- update detect
- update button
- draft 보호
- reload

---

## 48. CI/CD

PR:

```text
npm ci
→ typecheck
→ lint
→ unit test
→ build
→ integration test
```

Main:

```text
push
→ Cloudflare Workers Build
→ Production Deploy
```

Production migration은 초기에는 명시적으로 실행한다.

---

## 49. Branch

```text
main
feature/*
fix/*
```

```text
feature/*
→ Pull Request
→ Preview
→ Review
→ main merge
→ Production
```

---

## 50. Route

```text
/
→ Dashboard

/students
→ 학생 목록

/students/:studentId
→ 학생 상세

/students/:studentId/counseling/new
→ 상담 작성

/counseling/:id
→ 상담 상세

/calendar
→ 일정

/reports
→ 검색/Excel

/trash
→ 휴지통

/settings
→ 설정
```

Mobile은 split-pane 대신 route 전환 사용.

---

## 51. ADR

### ADR-001 — Workers Static Assets

Cloudflare Pages 대신 Workers + Static Assets를 기본 배포 대상으로 사용.

### ADR-002 — Cloudflare Access

직접 비밀번호 인증 대신 Cloudflare Access를 기본 인증 계층으로 사용.

### ADR-003 — IndexedDB

LocalStorage 대신 IndexedDB.

### ADR-004 — 파일은 R2/Blob

Cloud 파일은 R2, Local 파일은 IndexedDB Blob.

### ADR-005 — 학적 분리

학년/반/번호는 `student_enrollments`.

### ADR-006 — 상담 독립 Entity

학생 내부 배열 금지. 상담마다 UUID.

### ADR-007 — Cloud Online First

복잡한 양방향 Offline Sync는 MVP 제외.

### ADR-008 — FTS5 후순위

실제 성능 문제 확인 후 도입.

### ADR-009 — AI는 보조 도구

정리/요약/브리핑/검색 보조만 수행.

---

## 52. 첫 구현 목표

첫 Commit에서 기능을 많이 만들지 않는다.

```text
React 화면
↓
Worker Static Assets
↓
/api/v1/health
↓
D1 연결
↓
Migration
↓
Cloudflare Access identity
↓
GitHub push 자동배포
```

Health 예:

```json
{
  "status": "ok",
  "appVersion": "0.1.0",
  "database": "ok"
}
```

이 기반이 정상 동작한 뒤 학생 → 상담 → 일정 순서로 구현한다.

---

## 53. 개발 원칙

```text
UI와 저장소를 분리한다.

Local과 Cloud를 따로 개발하지 않는다.

상담을 학생 객체 내부 배열로 저장하지 않는다.

데이터 삭제보다 보존·복원을 우선한다.

DB migration을 source control 한다.

민감정보를 로그·AI·Public Storage에 노출하지 않는다.

AI보다 상담관리 기본 기능이 항상 우선한다.

기능이 없어도 데이터는 절대 망가지지 않아야 한다.
```
