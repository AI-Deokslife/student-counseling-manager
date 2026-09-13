# 마음잇기

교사를 위한 학생 상담 기록 및 후속관리 PWA입니다. 하나의 React UI가 Repository 계층을 통해 Local Edition과 Cloud Edition을 지원하도록 설계합니다.

## 로컬 실행

```bash
npm install
npm run build
npm run db:migrate:local
npm run db:seed:local
npx wrangler dev
```

`wrangler dev`는 정적 React 앱과 Worker API를 함께 `http://localhost:8787`에서 제공합니다.

프론트엔드만 작업할 때는 다음 명령을 사용합니다. API 요청은 `localhost:8787`로 전달됩니다.

```bash
npm run dev
```

## 검증

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run db:migrate:local
```

## Cloudflare 설정

1. Production과 Preview D1 데이터베이스를 각각 생성합니다.
2. `wrangler.jsonc`의 placeholder database ID를 실제 ID로 교체합니다.
3. Cloudflare Access에서 애플리케이션을 보호하고 인증 이메일 헤더가 Worker에 전달되도록 합니다.
4. 최초 사용자의 `users`, `workspaces`, `workspace_members` 레코드를 migration 이후 등록합니다.
5. GitHub 환경에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` secret을 등록합니다.

초기 관리자 로그인은 `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` Worker Secret을 사용합니다. 비밀번호 원문은 저장하지 않습니다.

Preview와 Production은 서로 다른 D1 binding을 사용합니다. 운영 migration은 백업과 Preview 검증 후 명시적으로 적용합니다.

`seeds/demo.sql`은 실제 개인정보가 없는 가상 학생 20명, 상담 20건, 일정 12건을 제공합니다. 고정 UUID와 `INSERT OR IGNORE`를 사용해 중복 실행해도 같은 데이터가 유지됩니다.

학생 화면의 **Excel 등록**은 `.xlsx` 파일의 `이름`, `학년`, `반`, `번호` 열을 검사한 뒤 미리보기와 중복 확인을 거쳐 D1에 일괄 등록합니다. 화면에서 `student-import-template.xlsx` 양식을 내려받을 수 있습니다.

설정 화면의 JSON 백업은 학생, 학적, 상담 기록, 일정을 내려받으며 복원 전 구조 검증과 자동 서버 스냅샷을 수행합니다.

## API

- `GET /api/v1/health`: 앱과 D1 연결 상태
- `GET /api/v1/me`: Cloudflare Access 사용자와 workspace 권한
- 학생·상담·일정 CRUD와 소프트 삭제/복원
- 통합검색과 Excel 호환 CSV 출력
- JSON 백업 검증/복원과 V1 백업 가져오기
- 데이터 무결성 검사와 복원 전 서버 스냅샷

API 응답에는 `X-Request-Id`와 보안 헤더가 포함되며, 민감 데이터는 로그에 기록하지 않습니다.
