# 학생상담관리 시스템 V2 — Product Requirements Document

- 문서 버전: PRD v1.0
- 제품명(가칭): Student Counseling Manager V2
- 주요 사용자: 담임교사, 상담교사 등 학생 상담 업무 담당 교사
- 배포 환경: GitHub + Cloudflare Workers
- 운영 DB: Cloudflare D1
- 로컬 DB: IndexedDB
- 앱 형태: PWA
- 개발 전략: 단일 코드베이스 / Local Edition + Cloud Edition

---

## 1. 제품 개요

학생상담관리 시스템 V2는 교사가 학생별 상담 이력을 체계적으로 기록하고, 상담 일정과 후속 조치를 관리하며, 누적 상담 내용을 빠르게 검색·분석할 수 있도록 지원하는 PWA 기반 학생상담 업무관리 시스템이다.

기존 시스템의 다음 기능을 계승한다.

- 학생 관리
- 상담기록 관리
- 상담일정 관리
- 상담유형 및 태그
- 통계/대시보드
- Excel 등록/내보내기
- JSON 백업/복구

V2에서는 단순히 기능을 추가하는 것이 아니라, 수년간 사용할 수 있도록 데이터 구조·보안·복구·검색·배포 구조를 재설계한다.

### Local Edition

- IndexedDB에 데이터 저장
- 특정 PC/스마트폰/태블릿에서 독립적으로 사용
- 핵심 기능 오프라인 사용 가능
- 계정 없이 사용 가능
- 백업 파일로 데이터 이동/복구
- 사진/첨부파일은 IndexedDB Blob으로 저장

### 데이터 모드 전환

- DB 모드에서 로컬 모드로 전환할 때는 클라우드 백업 파일 다운로드와 IndexedDB 저장이 먼저 완료되어야 한다.
- 클라우드 자료 영구 삭제는 다운로드된 전환 백업 확인 체크 후에만 활성화한다.
- 로컬 모드에서 DB 모드로 전환할 때는 로컬 백업 구조를 Cloud DB에 업로드하며, 로컬 자료는 자동 삭제하지 않는다.
- 두 모드 사이 자동 양방향 동기화는 제공하지 않는다.

### Cloud Edition

- Cloudflare D1에 데이터 저장
- 여러 기기에서 동일 데이터 접근
- Cloudflare Access 기반 인증
- 초기 운영 시 Worker Secret 기반 관리자 로그인 지원
- GitHub push 기반 자동 배포
- 사진/첨부파일은 Cloudflare R2 사용
- 서버 기반 변경이력, 백업, AI 연동 지원

---

## 2. 제품 목표

제품의 핵심 흐름은 다음과 같다.

> 학생 확인 → 상담 준비 → 상담 → 기록 → 후속조치 → 재상담 → 누적 이력 확인

핵심 목표:

1. 학생별 상담 이력을 빠르게 확인할 수 있어야 한다.
2. 상담 후 기록을 짧은 시간 안에 남길 수 있어야 한다.
3. 후속 상담이 필요한 학생을 놓치지 않아야 한다.
4. 특정 학생·기간·상담유형별 기록을 빠르게 검색할 수 있어야 한다.
5. 데이터가 수년간 누적되어도 관리가 가능해야 한다.
6. Local과 Cloud 버전을 중복 개발하지 않아야 한다.
7. 백업·복구·휴지통을 통해 데이터 손실 가능성을 낮춰야 한다.
8. AI는 교사의 판단을 대체하지 않고 기록·정리·검색을 보조해야 한다.

---

## 3. 비목표

V2 범위에서 제외한다.

- 학부모 상담예약 시스템
- 학생/학부모 직접 로그인
- 성적관리 시스템
- 출결관리 시스템
- 생활기록부 작성 시스템
- 메신저
- SMS/카카오 알림톡
- AI 기반 위험도 점수
- AI 기반 심리진단
- AI 기반 문제학생 분류
- AI 기반 자동 의사결정

제품의 중심은 **교사를 위한 학생 상담 기록 및 후속관리**이다.

---

## 4. 전체 제품 구조

```text
Student Counseling Manager V2
│
├─ Dashboard
├─ Students
├─ Counseling
├─ Calendar
├─ Search / Reports
├─ Backup / Restore
├─ Trash
├─ Settings
└─ AI Assistance (optional)
```

저장 계층:

```text
UI / Domain / Business Logic
            │
            ▼
      Repository Layer
        ├─ IndexedDB
        └─ Worker API → D1
```

---

## 5. 배포 및 인프라

### Cloud Edition 권장 구조

```text
GitHub Repository
        │
        │ push / merge
        ▼
Cloudflare Workers Builds
        │
        ▼
Cloudflare Worker
 ├─ React PWA Static Assets
 └─ /api/v1/*
      ├─ Cloudflare Access identity
      ├─ D1
      ├─ R2
      └─ AI API (optional)
```

### 환경

- Local
- Preview/Staging
- Production

Production DB와 Preview DB는 반드시 분리한다.

---

## 6. 핵심 기능

### 6.1 학생 관리

학생 기본정보:

- 이름
- 학생 연락처
- 보호자 연락처
- 사진
- 태그
- 관심학생 여부
- 메모
- 상태(active/graduated/transferred/inactive)

학년·반·번호는 학생 기본정보에 직접 저장하지 않고 **학년도별 학적이력**으로 저장한다.

예:

```text
김민수
2025 → 1학년 3반 12번
2026 → 2학년 4반 7번
2027 → 3학년 2반 3번
```

기능:

- 학생 등록/수정
- 학생 검색
- 학년도/학년/반 필터
- 태그 필터
- 관심학생 필터
- Excel 일괄등록
- 졸업/전학/비활성 처리
- 휴지통/복원

---

### 6.2 상담 기록

상담 레코드는 독립 Entity로 관리하며 반드시 고유 ID를 가진다.

필드:

- 학생
- 상담일
- 상담시간
- 상담유형
- 한줄 요약
- 상세 내용
- 상태
- 후속상담일
- 태그
- 작성자
- 작성일
- 수정일

상담상태:

- 일반
- 관찰
- 후속상담 필요
- 진행 중
- 완료

AI가 상담 상태를 자동 결정하지 않는다.

---

### 6.3 빠른 상담 입력

모든 주요 화면에서 빠르게 상담을 기록할 수 있어야 한다.

```text
+ 빠른 상담

학생    [검색]
유형    [선택]
날짜    [오늘]

한줄 기록
[                         ]

[상세 작성] [저장]
```

목표: **20초 이내 간단 상담기록 입력**

---

### 6.4 학생 상세 / 타임라인

학생 상세 상단:

```text
김○○
2학년 3반 12번

[관심학생] [진로고민]

최근 상담       2026.09.10
총 상담              8회
다음 후속상담   2026.09.24
현재 상태       후속상담 필요
```

하단은 최신순 상담 타임라인:

```text
2026.09.10 진로상담
진로 선택 관련 상담

2026.08.21 학업상담
수학 학습 계획 상담

2026.07.02 교우관계
```

필터:

- 기간
- 상담유형
- 상담상태
- 태그

---

### 6.5 상담 일정

기능:

- 월간/주간/목록
- 학생 선택
- 날짜/시간
- 상담유형
- 메모
- 일정 수정/취소
- 상담 완료 처리

상담 완료 시:

```text
Schedule
  ↓
Counseling Record 생성
  ↓
schedule.status = completed
  ↓
schedule.counseling_record_id 연결
```

완료된 일정은 삭제하지 않는다.

---

### 6.6 후속상담 관리

상담기록에 후속상담일을 지정할 수 있다.

대시보드:

```text
오늘 후속상담        3명
이번 주 후속상담     7명
기한 지난 후속상담   2명
```

교사는 후속상담 완료 시 새로운 상담기록을 작성한다.

---

### 6.7 대시보드

업무 우선형 대시보드.

상단 카드:

- 전체 학생
- 이번 주 상담
- 오늘 상담
- 후속상담 필요

업무 목록:

- 오늘 상담
- 기한 지난 후속상담
- 이번 주 후속상담
- 관심학생

통계:

- 상담 유형별
- 월별 상담 건수
- 학년별 상담 건수
- 기간별 상담 추이

---

### 6.8 통합 검색

검색 대상:

- 학생 이름
- 학년
- 반
- 번호
- 상담 유형
- 상담 요약
- 상담 상세내용
- 태그
- 기간
- 상담 상태

상세검색:

```text
기간
학년도
학년
반
학생
상담유형
상담상태
태그
후속상담 여부
```

---

### 6.9 Excel Import / Export

Import:

```text
파일 선택
→ Client Parse
→ Preview
→ Validation
→ 사용자 확인
→ 저장
```

Export 조건:

- 전체 학생
- 선택 학생
- 특정 학생
- 기간
- 상담유형
- 태그
- 상담상태

포함 항목:

- 학생 기본정보
- 상담 요약
- 상담 상세내용
- 상담 유형
- 태그
- 연락처(기본 제외)
- 보호자 연락처(기본 제외)

출력 형태:

- 학생목록 + 상담기록
- 통합 상담기록
- 학생별 상담 시트

---

## 7. 학년도 관리

현재 학년도 설정:

```text
현재 학년도: 2026
```

학년도 전환 시:

1. 기존 학년도 데이터 보존
2. 다음 학년도 생성
3. 진급 대상 학생 선택
4. 새 학적 생성
5. 졸업생 상태 변경
6. current_school_year 변경

상담기록은 이동하지 않는다.

---

## 8. 백업 및 복구

### Local Edition

백업 파일:

```text
student-counseling-backup-2026-09-13.scmbackup
```

포함:

- students
- enrollments
- counselingTypes
- tags
- studentTags
- counselingRecords
- counselingRecordTags
- schedules
- settings

복구 전:

1. 파일 형식 검증
2. schemaVersion 검증
3. 참조 무결성 검사
4. 데이터 건수 표시
5. 현재 데이터 자동 백업
6. 사용자 확인
7. 복구 실행

### Cloud Edition

3단계 보호:

1. 애플리케이션 백업 파일
2. D1 Time Travel
3. 운영자 SQL Export

---

## 9. 휴지통

학생과 상담은 즉시 영구삭제하지 않는다.

```text
삭제
 ↓
Soft Delete
 ↓
휴지통
 ↓
복원 / 관리자 영구삭제
```

주요 Entity는 `deleted_at`을 사용한다.

---

## 10. 데이터 무결성 검사

관리자 설정에 데이터 검사 기능 제공.

검사 예:

- 학생 없는 상담
- 학생 없는 일정
- 학적 없는 active 학생
- 잘못된 태그 관계
- 완료 일정인데 상담기록 연결이 없음
- 존재하지 않는 R2 파일 참조
- 중복 ID
- 잘못된 날짜

자동수정은 기본적으로 수행하지 않고 결과를 먼저 표시한다.

---

## 11. PWA

필수:

- manifest
- service worker
- app icons
- offline shell
- 설치 가능 상태 감지
- 설치 후 버튼 숨김
- 업데이트 감지
- 사용자 선택 업데이트

미설치:

```text
[앱 설치]
```

설치 후 버튼 숨김.

업데이트:

```text
새 버전이 있습니다.
[업데이트]
```

작성 중 상담기록이 있을 때는 자동 reload를 금지한다.

---

## 12. 오프라인 정책

### Local Edition

**Offline First**

오프라인 가능:

- 학생
- 상담
- 일정
- 검색
- 통계
- Excel
- 백업/복구

### Cloud Edition

**Online First**

- 앱 shell은 캐시 가능
- 상담 API 데이터는 Cache Storage에 기본 저장하지 않음
- 복잡한 D1 ↔ IndexedDB 양방향 동기화는 MVP 제외

---

## 13. 사진 및 첨부파일

### Local

IndexedDB Blob

### Cloud

```text
D1 → metadata / storage_key
R2 → actual binary
```

학생 사진:

- 브라우저 업로드 전 리사이즈
- WebP 권장
- 최대 512×512
- 원본 사진 장기보관은 기본 제외

---

## 14. AI 기능

AI는 선택 기능이며 시스템 핵심 기능과 분리한다.

### 허용

1. 상담 기록 자동 정리
2. 학생 누적 상담 요약
3. 상담 전 브리핑
4. 자연어 검색 → SearchFilter 변환
5. 문장 다듬기
6. 상담유형/태그 추천(자동적용 금지)
7. 집계 기반 보고서 초안

### 금지

- 위기학생 점수
- 우울/심리 진단
- 문제학생 판정
- 위험도 순위
- 성격 판정
- 자동 상담 결정

AI 출력은 교사가 확인한 후에만 영구 저장한다.

---

## 15. AI 개인정보 원칙

브라우저가 AI API를 직접 호출하지 않는다.

```text
Browser
 ↓
Worker /api/v1/ai/*
 ↓
PII 최소화
 ↓
AI Provider
```

AI 요청에서 기본 제거:

- 학생 실명
- 전화번호
- 보호자 전화번호
- 사진
- 학번
- 주소

가능하면 임시 Identifier 사용:

```text
Student A
Record 1
Record 2
```

---

## 16. 인증 및 권한

Cloud Edition은 Cloudflare Access를 기본 인증 계층으로 사용한다.

`workers.dev` 초기 배포처럼 Access 정책을 아직 연결하지 못한 환경에서는 Worker Secret 기반 관리자 로그인을 보조 인증 계층으로 사용할 수 있다. 초기 비밀번호는 충분한 엔트로피로 무작위 생성하며, 원문은 코드나 D1에 저장하지 않고 bcrypt 해시만 Secret으로 관리한다. 로그인 세션은 짧은 만료시간의 `HttpOnly`, `Secure`, `SameSite=Strict` 쿠키를 사용한다.

앱 내부 권한:

- owner
- admin
- teacher
- readonly

모든 API query는 authenticated workspace 범위로 제한한다.

Local Edition의 PIN은 강력한 보안경계가 아니라 우발적 열람 방지 기능으로 정의한다.

---

## 17. 보안 요구사항

필수:

- HTTPS
- Cloudflare Access
- Workspace authorization
- Prepared Statement
- Worker-side validation
- Markdown sanitization
- CSP
- No public R2
- API key Worker Secret 저장
- 민감정보 로그 금지
- Soft Delete
- Audit Log
- Backup
- Preview/Production DB 분리

---

## 18. V1 데이터 마이그레이션

V1 백업 구조:

```json
{
  "students": [],
  "counselingTypes": [],
  "schedules": [],
  "tags": []
}
```

V2 변환:

```text
V1 JSON
→ 구조 검증
→ 학생 변환
→ 학적 생성
→ counselingHistory 분리
→ 상담별 UUID 생성
→ 유형/태그 mapping
→ 일정 변환
→ 사진 변환
→ 무결성 검사
→ Commit
```

V1 학생의 `grade/classNum/studentNum`은 현재 학년도의 enrollment로 변환한다.

---

## 19. 우선순위

### P0

- 학생 관리
- 학적
- 상담 CRUD
- 빠른 상담
- 상담 검색
- 일정
- 후속상담
- 백업/복구
- Excel
- PWA
- D1
- IndexedDB
- GitHub 자동배포

### P1

- 휴지통
- 자동저장
- 데이터 검사
- Audit Log
- V1 Migration
- 사진 R2 저장

### P2

- AI 상담 정리
- AI 누적 요약
- AI 상담 브리핑
- AI 자연어 검색
- 첨부파일
- 고급 통계

---

## 20. 개발 단계

### Phase 1 — 기반

- React + TypeScript + Vite
- Cloudflare Worker
- Workers Static Assets
- GitHub CI/CD
- D1
- Migration
- Cloudflare Access
- PWA 기본

### Phase 2 — 학생관리

- Student CRUD
- Enrollment
- Tag
- Favorite
- Photo
- Search
- Excel Import

### Phase 3 — 상담관리

- Counseling CRUD
- Counseling Type
- Status
- Follow-up
- Quick Counseling
- Draft
- Timeline

### Phase 4 — 일정/대시보드

- Calendar
- Schedule CRUD
- Complete Schedule
- Dashboard

### Phase 5 — 데이터 관리

- Excel Export
- Backup
- Restore
- Trash
- Integrity Check
- V1 Import

### Phase 6 — Local Edition

- IndexedDB Repository
- Local Blob
- Offline
- Local Backup/Restore

### Phase 7 — AI

- Summary
- Briefing
- Cumulative Summary
- Natural Search

---

## 21. MVP 완료 기준

다음 시나리오가 PC와 스마트폰에서 성공해야 한다.

```text
GitHub main push
↓
Cloudflare 자동 배포
↓
Access 로그인
↓
학생 Excel 등록
↓
학생 선택
↓
상담 입력
↓
후속상담 지정
↓
대시보드 확인
↓
상담 일정 등록
↓
상담 완료 처리
↓
학생 타임라인 확인
↓
기간 검색
↓
Excel 출력
↓
백업
↓
데이터 삭제
↓
휴지통 복원
↓
백업 복구
↓
V1 데이터 Import
↓
PWA 설치
↓
새 버전 배포
↓
업데이트 버튼 표시
↓
업데이트 완료
```

---

## 22. 제품 원칙

```text
학생 → 상담 → 후속조치 → 누적이력
```

을 모든 UX의 중심으로 둔다.

기능의 개수보다 다음 질문에 빠르게 답할 수 있어야 한다.

- 이 학생과 이전에 어떤 이야기를 했는가?
- 무엇을 확인하기로 했는가?
- 이후 어떻게 달라졌는가?
- 다음에는 무엇을 확인해야 하는가?
