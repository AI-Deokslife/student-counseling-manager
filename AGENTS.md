# AGENTS.md — Student Counseling Manager V2

이 파일은 Codex, Antigravity 및 기타 코딩 에이전트가 이 저장소에서 작업할 때 따라야 할 최상위 프로젝트 지침이다.

---

## 1. 작업 전 반드시 읽을 문서

구현 또는 수정 전에 다음 문서를 읽는다.

1. `docs/PRD.md`
2. `docs/TDD.md`

PRD는 **무엇을 왜 만드는지** 정의한다.  
TDD는 **어떻게 구현하는지** 정의한다.

두 문서와 충돌하는 구현을 임의로 만들지 않는다.

요구사항을 변경해야 할 필요가 생기면 코드부터 바꾸지 말고, 변경 이유를 명확히 기록하고 문서를 함께 갱신한다.

---

## 2. 프로젝트 목적

이 시스템은 **교사를 위한 학생 상담 기록 및 후속관리 시스템**이다.

핵심 흐름:

```text
학생
→ 상담
→ 후속조치
→ 재상담
→ 누적이력
```

학부모 상담예약, 성적관리, 출결관리, 학생/학부모 로그인 시스템으로 제품 범위를 확장하지 않는다.

---

## 3. 확정 기술 스택

- Frontend: React + TypeScript + Vite
- UI: Tailwind CSS
- Routing: React Router
- Validation: Zod
- Server State: TanStack Query
- Local DB: IndexedDB via Dexie
- Cloud API: Cloudflare Worker
- Cloud DB: Cloudflare D1
- Cloud Files: Cloudflare R2
- Authentication: Cloudflare Access
- Deployment: GitHub → Cloudflare Workers Builds
- App Type: PWA

---

## 4. 핵심 Architecture

Local과 Cloud는 별도 앱이 아니다.

```text
Shared UI
Shared Domain Model
Shared Business Rules
        │
        ▼
Repository Interface
   ├─ IndexedDB
   └─ HTTP API → Worker → D1
```

두 버전을 독립적으로 구현하지 않는다.

UI component는 데이터가 D1인지 IndexedDB인지 알 필요가 없어야 한다.

---

## 5. 데이터 규칙

반드시 지킨다.

- Student, Counseling, Schedule 등 주요 Entity는 UUID 사용
- Counseling Record는 독립 Entity
- 상담기록을 학생 객체 안의 배열 index로 식별하지 않음
- 학년/반/번호는 `student_enrollments`에서 학년도별 관리
- 학생/상담 삭제는 기본적으로 Soft Delete
- Cloud DB 구조 변경은 반드시 D1 migration 사용
- 사진/첨부파일 binary를 D1에 직접 저장하지 않음
- Cloud 파일은 R2
- Local 파일은 IndexedDB Blob
- 모든 Cloud 데이터 Query는 workspace 범위로 제한

---

## 6. 상담 데이터 원칙

상담은 시스템에서 가장 중요한 데이터다.

상담 레코드에는 최소한 다음 정보가 있다.

```text
id
studentId
date
time
type
summary
content
status
followUpDate
createdAt
updatedAt
```

상담 수정 시 동시성 충돌 가능성을 고려한다.

상담/학생 삭제는 기본적으로 즉시 영구삭제하지 않는다.

---

## 7. 보안 규칙

절대로 하지 않는다.

- API Key를 frontend bundle에 포함
- Password/API Token을 Git에 commit
- 학생 상담본문을 console log
- 학생/보호자 전화번호를 log
- R2 bucket을 불필요하게 public으로 설정
- SQL 문자열에 사용자 입력 직접 interpolation
- Client validation만 신뢰
- 인증 없이 `/api/*` 민감 endpoint 접근 허용
- workspace_id 검증 없이 D1 조회
- Markdown parser 결과를 sanitizer 없이 innerHTML에 삽입

반드시 한다.

- Worker-side validation
- Prepared Statement
- Cloudflare Access identity 확인
- Workspace authorization
- Security Headers
- Markdown sanitization
- Secret binding
- Audit Log
- Backup/Restore 안전절차

---

## 8. AI 기능 규칙

AI는 교사를 보조한다.

허용:

- 상담기록 요약
- 상담 전 브리핑
- 누적 상담 요약
- 문장 정리
- 자연어 → SearchFilter 변환
- 상담유형/태그 추천
- 집계 기반 보고서 초안

금지:

- 학생 위험도 점수
- 심리/정신건강 진단
- 문제학생 자동 분류
- 위험학생 순위
- 성격 판정
- 자동 상담 의사결정

AI output은 자동으로 permanent data로 확정하지 않는다.

교사가 확인·수정 후 저장하도록 한다.

AI가 SQL을 직접 생성해 실행하도록 만들지 않는다.

```text
Natural Language
→ AI SearchFilter JSON
→ Zod Validation
→ Fixed Query Builder
→ D1
```

---

## 9. 개인정보 최소화

AI 요청 전 가능한 개인정보 제거:

- 실명
- 학번
- 전화번호
- 보호자 전화번호
- 사진
- 주소

가능하면 임시 Identifier 사용.

```text
Student A
Record 1
Record 2
```

---

## 10. PWA 규칙

Local Edition:

```text
Offline First
```

Cloud Edition:

```text
Online First
```

Cloud API의 학생/상담 response를 Service Worker Cache Storage에 기본 저장하지 않는다.

새 Service Worker가 있더라도 상담 draft가 작성 중이면 강제 reload하지 않는다.

---

## 11. UI 원칙

우선순위:

1. 학생 찾기
2. 이전 상담 확인
3. 상담 빠르게 기록
4. 후속상담 놓치지 않기
5. 기간/유형별 검색
6. 안전한 백업/복원

화려한 기능보다 교사가 매일 빠르게 사용하는 흐름을 우선한다.

스마트폰에서도 핵심 상담 작성이 가능해야 한다.

---

## 12. 빠른 상담

전역에서 빠른 상담 입력 기능을 제공한다.

목표:

```text
20초 이내 간단 상담기록 저장
```

상세내용 입력은 선택 가능.

---

## 13. 변경 시 테스트

작업 완료 전 관련 범위에 따라 실행한다.

최소:

```text
typecheck
lint
unit tests
build
```

DB/API 변경 시:

```text
migration test
integration test
```

UI 흐름 변경 시:

```text
affected E2E flow
```

PWA 변경 시:

```text
install/update/offline behavior
```

---

## 14. Migration 원칙

Production DB를 직접 수동 수정하지 않는다.

모든 schema 변경은:

```text
migrations/
```

에 파일로 남긴다.

Migration 순서:

```text
Local
→ Preview DB
→ Preview App Test
→ Production DB
→ Production Deploy
→ Smoke Test
```

Destructive migration은 rollback/restore 계획 없이 실행하지 않는다.

---

## 15. Preview와 Production 분리

절대로 Preview build가 Production D1/R2에 write하지 않도록 한다.

환경:

```text
Local
Preview
Production
```

각 환경은 적절한 DB/Storage binding을 사용한다.

---

## 16. Logging

허용 예:

```typescript
console.log({
  requestId,
  route,
  method,
  status,
  duration
});
```

금지:

```typescript
console.log(requestBody);
console.log(student);
console.log(counseling.content);
```

민감정보는 에러로그에도 포함하지 않는다.

---

## 17. 코드 작성 원칙

- 작은 단위로 구현
- 기존 Domain Model 재사용
- Repository Interface 우선
- 중복 로직 최소화
- 입력/출력 Type 명확화
- UI에서 raw SQL 또는 storage detail 알지 못하게 함
- 이름 없는 magic value 최소화
- destructive action은 명시적 confirmation
- 오류를 조용히 무시하지 않음
- 사용자 데이터 손실 가능성이 있으면 안전한 방향 선택

---

## 18. 요구사항이 모호할 때

새 행동을 임의로 발명하기 전에 다음 순서로 확인한다.

1. `docs/PRD.md`
2. `docs/TDD.md`
3. 기존 domain/type
4. 기존 migration/API convention

그래도 결정이 필요한 경우 가장 단순하고 데이터 보존에 유리한 설계를 선택하고, 중요한 결정은 문서화한다.

---

## 19. 완료 정의

기능을 완료했다고 판단하려면:

- 요구사항 충족
- TypeScript 오류 없음
- Build 성공
- 관련 테스트 성공
- 데이터 손실 위험 없음
- Local/Cloud architecture 위반 없음
- 민감정보 노출 없음
- 문서 변경이 필요한 경우 PRD/TDD도 갱신

---

## 20. 첫 개발 우선순위

기능을 많이 만들기 전에 아래 세로 흐름을 먼저 완성한다.

```text
GitHub
→ Cloudflare Workers Build
→ React Static Assets
→ /api/v1/health
→ D1
→ Migration
→ Cloudflare Access
→ /api/v1/me
```

이후:

```text
학생
→ 상담
→ 일정
→ 백업/복구
→ Local Edition
→ AI
```

순서로 개발한다.
