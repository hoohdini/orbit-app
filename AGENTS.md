# orbit-app 작업 규칙 (에이전트용)

Claude Code, Cursor, Codex 등 어떤 도구로 작업하든 이 파일을 따른다. `CLAUDE.md` 는 이 파일을 불러온다.

이 저장소에서 코드를 쓰기 전에 `docs/MODULES.md`, `docs/SCHEMA.md`, `docs/API.md` 를 읽는다. 세 문서와 `supabase/migrations/*.sql` 이 계약이다. 계약을 바꾸는 작업은 사람이 지시한 경우에만 하고, 바꿀 때는 문서와 SQL 을 같은 커밋에서 고친다.

## 0. 먼저 구역을 확인한다 (가장 중요)

작업을 시작하기 전에 `git branch --show-current` 로 브랜치 이름을 보고, 앞부분에 맞는 구역 안의 파일만 만들고 고친다. 구역 밖 파일이 바뀐 PR 은 GitHub 의 구역 검사에서 실패한다. 표의 정본은 `docs/COLLAB.md` 다.

| 브랜치 | 고쳐도 되는 곳 | 고치면 안 되는 곳 |
|---|---|---|
| `fe/...` 화면 | `apps/web/app/(modules)/`, `apps/web/components/`, `apps/web/public/`, `apps/web/app/` 바로 아래의 `globals.css` · `layout.tsx` · `page.tsx` · `logout/` · `dev/` | `apps/web/app/api/`, `apps/web/lib/`, `supabase/`, `services/`, `docs/`, 공용 파일 |
| `be/...` API · DB | `apps/web/app/api/`, `apps/web/lib/`, `supabase/`, `scripts/`, `docs/` | 화면 폴더, `services/`, 공용 파일 |
| `compute/...` 계산 서비스 | `services/compute/`, `docs/` | `apps/`, `supabase/`, 공용 파일 |
| `docs/...` 문서 | `docs/`, `README.md` | 그 밖 전부 |
| `setup/...` 공용 설정(성하만) | 전부 | 없음 |

공용 파일: `package.json`, `apps/web/package.json`, `apps/web/package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.github/`, `CLAUDE.md`, `AGENTS.md`.

브랜치가 `main` 이거나 위 표에 없는 이름이면 코드를 고치기 전에 사람에게 어느 구역 작업인지 묻는다.

## 1. 구역 밖이 필요할 때

- 화면 작업에 없는 API 가 필요하면 API 를 만들지 않는다. 모듈 폴더 안에 `mock.ts` 를 두고 `docs/API.md` 와 `docs/SCHEMA.md` 의 이름 그대로 가짜 데이터를 만들어 화면을 완성한다. 필요한 API 는 PR 설명의 다른 구역에 부탁할 것 칸에 적는다.
- 화면 작업에서 `lib/` 의 함수가 조금 달라야 하면 `lib/` 를 고치지 않고 모듈 폴더 안에 작은 함수를 새로 만든다.
- 패키지를 새로 설치하지 않는다(`npm install 패키지이름` 금지). 필요하면 PR 설명에 적는다.
- `npm install` 만 실행해도 `apps/web/package-lock.json` 이 바뀔 수 있다. 커밋 전에 `git status` 로 확인하고 바뀌었으면 `git checkout -- apps/web/package-lock.json` 으로 되돌린다.

## 2. 공통 규칙

- 한 작업은 한 모듈 안에서 끝낸다. 다른 모듈 폴더는 읽어도 되지만 고치지 않는다.
- 브라우저 코드에서 Supabase 클라이언트를 만들지 않는다. DB 접근은 `apps/web/lib/db.ts` 의 서버 전용 클라이언트를 API Route 안에서만 쓴다.
- 화면은 `apps/web/lib/client.ts` 의 함수로 `/api/...` 를 부른다. 응답 모양은 `docs/API.md` 를 따른다.
- 새 API Route 는 `docs/API.md` 의 응답 형식을 따르고, 문서의 표에 한 줄 추가한다.
- 비밀값은 `process.env` 로만 읽고 코드에 적지 않는다.
- 이미 있는 파일을 통째로 다시 쓰지 않는다. 필요한 줄만 고친다. 줄 순서 바꾸기, 포맷 정리, 이름 바꾸기처럼 요청받지 않은 정리는 하지 않는다(다른 사람 PR 과 충돌하는 가장 흔한 원인이다).
- 커밋 전에 `apps/web` 에서 `npx next typegen && npx tsc --noEmit` 과 `npm run lint` 를 돌린다. GitHub 의 웹 검사와 같은 명령이다.
- 완료 보고에는 실행한 명령과 결과(검사 통과, 화면 확인)를 적는다. 실행하지 않은 것은 실행하지 않았다고 적는다.
- 문서는 -이다 체로 쓰고 이모지와 따옴표를 쓰지 않는다.
