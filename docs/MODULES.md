# 모듈 경계와 의존 방향 (2026-09-25)

회의록 14 의 분담을 코드 구조로 옮긴 것이다. 각자 백지 데모를 만들어 와도 나중에 붙을 수 있게 경계를 먼저 고정한다.

## 모듈과 담당

| 모듈 | 화면 폴더 | API 폴더 | 담당 | 화면 플로우(피그마) |
|---|---|---|---|---|
| onboarding | `apps/web/app/(modules)/onboarding` | `apps/web/app/api/onboarding` | 성하 | QR 입장 → 이름·비밀번호 로그인 → 개인정보 동의 → 테이블 번호 안내 |
| home | `apps/web/app/(modules)/home` | `apps/web/app/api/home` | 성하 | 궤도 시각화, 내 간단 소개, 하단 메뉴, 사용설명서 |
| card | `apps/web/app/(modules)/card` | `apps/web/app/api/card` | 성하 | 내 명함, 명함 QR 스캔, 타인 명함 저장, 명함함 |
| tabletalk | `apps/web/app/(modules)/tabletalk` | `apps/web/app/api/tabletalk` | 민찬 | 테이블 구성원 소개·관심분야, 끝날 때 만족도 팝업 |
| coffeechat | `apps/web/app/(modules)/coffeechat` | `apps/web/app/api/coffeechat` | 민찬 | 1차 배정 테이블 + 추천 인원 목록(현재 테이블 표시) + 테이블별 소개·대화거리 |
| poster | `apps/web/app/(modules)/poster` | `apps/web/app/api/poster` | 민찬 | 포스터 QR → 퀴즈 → 정답 시 스탬프 → 관심도 → 스탬프 현황 → 응모권 |
| ops | `apps/web/app/(modules)/ops` | `apps/web/app/api/ops` | 성하 | 운영 콘솔. 체크인, 배정 버전 공개, 응답률 |
| compute | `services/compute` | HTTP(내부) | 민찬 | 전날 배치(임베딩·주소·테이블토크 배정), 커피챗 재계산(점수·배정·추천) |

## 의존 방향

```
화면(모듈 page.tsx, 클라이언트 컴포넌트)
   │  fetch('/api/<module>/...')          브라우저는 이 줄만 한다
   ▼
API Route (app/api/<module>/route.ts)     세션 확인, 입력 검증, DB 읽기·쓰기
   │  lib/db.ts (service_role)            서버 전용
   ▼
Supabase Postgres                          스키마 정본 supabase/migrations
   ▲
   │  service_role, 버전 붙여 쓰기
계산 서비스 (services/compute)              API Route 가 공유 비밀키로 호출하거나 운영자가 직접 실행
```

허용되는 import 방향은 한 가지다. 모듈 → `lib/`, `components/`. 모듈끼리는 import 하지 않는다. `lib/` 와 `components/` 는 모듈을 import 하지 않는다. 공용 컴포넌트가 모듈 API 가 필요하면 URL 로만 부른다(예: `BottomNav` 가 `/api/card/inbox` 의 수를 배지로 그린다).

라우트 보호는 `home/layout.tsx` 방식이 기본이다. 검색 파라미터를 보고 돌아올 곳(`next`)이 필요한 모듈(명함의 `/card?p=`)은 layout 대신 page 마다 `_guard.ts` 의 `requireOnboarded(next)` 를 부른다.

## 공용으로 두는 것 (모듈이 아니라 lib·components)

| 것 | 위치 | 이유 |
|---|---|---|
| DB 클라이언트 | `apps/web/lib/db.ts` | 서버 전용. 브라우저 번들에 들어가면 안 된다 |
| 세션(로그인 쿠키) | `apps/web/lib/session.ts` | 모든 API Route 가 같은 방식으로 참가자 id 를 얻는다 |
| API 응답 형식 | `apps/web/lib/api.ts` | `docs/API.md` 의 ok/error 형식 |
| QR 스캐너 | `apps/web/components/QrScanner.tsx` | 명함·포스터가 같은 스캐너를 쓴다. `onDecode(text)` 로 읽은 문자열을 그대로 넘기고, 종류 구분(`docs/QR_FORMAT.md`)은 화면이 한다. `onDenied()` 는 카메라 권한 거부. HTTPS 또는 localhost 에서만 카메라가 열린다 |
| 하단 메뉴 | `apps/web/components/BottomNav.tsx` | 모든 모듈 화면 아래에 붙는다 |
| 이벤트 로그 | `apps/web/lib/log.ts` | `event_log` 에 한 줄 쓰는 함수 |

## 백지 데모를 만들 때

1. `npm run dev` 로 뜨는 상태에서 자기 모듈 폴더 안에만 파일을 만든다.
2. DB 가 아직 없으면 `lib/db.ts` 대신 모듈 안에 `mock.ts` 를 두고 가짜 배열로 시작한다. 나중에 `lib/db.ts` 호출로 바꾼다. 가짜 데이터의 모양은 `docs/SCHEMA.md` 의 컬럼 이름을 그대로 쓴다.
3. 다른 모듈의 화면이 필요하면(예: 홈에서 명함으로 이동) 링크만 건다. 컴포넌트를 가져오지 않는다.
4. 모듈 이름은 URL 이다. `/onboarding`, `/home`, `/card`, `/tabletalk`, `/coffeechat`, `/poster`, `/ops`.

## 에이전트에게 작업을 줄 때

- 작업 한 건은 모듈 하나, 화면 하나 또는 API Route 하나로 자른다.
- 프롬프트에 `docs/SCHEMA.md` 의 해당 테이블 행과 `docs/API.md` 의 응답 형식을 붙인다.
- 완료 기준은 `npm run build` 통과와 화면 확인이다. 에이전트 보고에 실행 결과가 없으면 완료로 보지 않는다.
