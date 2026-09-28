# API 규칙과 경로 목록 (2026-09-25)

## 규칙

1. 모든 API 는 `apps/web/app/api/<module>/<name>/route.ts` 에 둔다. 브라우저는 이 경로만 호출한다.
2. 응답 형식은 둘 중 하나다.

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "사람이 읽는 설명" } }
```

   HTTP 상태는 200(ok), 400(입력 오류), 401(로그인 필요), 403(권한 없음), 404, 409(중복), 500 을 쓴다.
3. 로그인이 필요한 경로는 `lib/session.ts` 의 `requireSession()` 으로 참가자 id 를 얻는다. 요청 본문의 참가자 id 를 믿지 않는다.
4. 입력은 zod 로 검증한다. 검증 실패는 400.
5. 사용자가 거짓말하면 곤란해지는 판정(정답 여부, 스탬프 적립, 명함 교환 성립, 응모권)은 전부 서버에서 한다.
6. 응답에 넣지 않는 것: 비밀번호 해시, 정답 인덱스, 다른 사람의 연락처(공개 범위 밖), service_role 키.
7. 쓰기 API 는 `event_log` 에 한 줄 남긴다(`lib/log.ts`).

## 세션

- 로그인: `POST /api/onboarding/login` (display_name, pin). 성공 시 httpOnly 쿠키 `orbit_session`(서명된 JWT, participant id, is_admin, 24시간). 첫 로그인은 checkins 에 자동 기록된다.
- 로그아웃: `POST /api/onboarding/logout`.
- 관리자 경로(`/api/ops/*`)는 `requireAdmin()`.

## 경로 목록 (계약. 만들면서 한 줄씩 채운다)

| 모듈 | 경로 | 방법 | 입력 | 응답 data | 상태 |
|---|---|---|---|---|---|
| 공용 | /api/health | GET | 없음 | { version, db: ok/fail } | 있음 |
| onboarding | /api/onboarding/login | POST | display_name, pin(숫자 4자리), participant_id? | { participant: {id, display_name, role, is_admin}, consented } 또는 동명이인이면 { choose: [{id, display_name, affiliation, role, cohort}] }. 실패 401, 5회 실패 후 10분 423 | 있음 |
| onboarding | /api/onboarding/logout | POST | 없음 | { ok } | 있음 |
| onboarding | /api/onboarding/consent | POST | agreed: true | { consent_at } | 있음 |
| onboarding | /api/onboarding/me | GET | 없음 | { participant, profile, consented, sid: {offer_sid, seek_sid, label, is_temp} 또는 null, table: {table_no, label, version} 또는 null } | 있음 |
| home | /api/home/orbit | GET | 없음 | { me: {sid_prefix, label}, rings: [{prefix_len, people: [{id, display_name, affiliation}]}] } | 예정 |
| card | /api/card/me | GET | 없음 | { card, visibility, qr_payload, wallet_count, unseen_count } qr_payload 는 명찰과 같은 `<origin>/card?p=<id>` | 있음 |
| card | /api/card/scan | POST | qr_payload, source?(qr 기본, manual) | { card, already_saved } 한 번 찍으면 양방향 2행(나→상대 source, 상대→나 auto). 본인 400 SELF_SCAN, 다른 행사·형식 오류 404 | 있음 |
| card | /api/card/wallet | GET | 없음 | { cards: [card…], received_count } 최근 순. card.source 가 auto 면 받은 것 | 있음 |
| card | /api/card/inbox | GET | 없음 | { new: [{exchange_id, message, card}], count } 아직 안 본 "OO 님에게 명함이 공유되었습니다" | 있음 |
| card | /api/card/inbox/seen | POST | exchange_ids?(비우면 전부) | { seen: n } | 있음 |
| card | /api/card/search | GET | q(2자 이상) | { people: [{id, display_name, affiliation}] } 같은 행사·체크인·본인 제외·10명. 카메라 대체 경로 | 있음 |
| card | /api/card/settings | POST | visibility?(all·scanned), links?({linkedin, github, email, url}) | { visibility, links } | 있음 |
| tabletalk | /api/tabletalk/table | GET | 없음 | { table_no, label, members: [{id, display_name, affiliation, topic_tags, offer_text}] } | 있음 |
| tabletalk | /api/tabletalk/satisfaction | POST | choice(아래 선택지), comment? | { saved: true } | 있음 |
| coffeechat | /api/coffeechat/table | GET | 없음 | { table_no, label, talk_prompts, members: [...] } | 있음 |
| coffeechat | /api/coffeechat/recs | GET | 없음 | { recs: [{rank, target: {id, display_name, affiliation}, current_table_no, reason}] } | 있음 |
| poster | /api/poster/scan | POST | qr_payload | { poster: {id, title}, quiz: {id, question, choices} } | 있음 |
| poster | /api/poster/answer | POST | quiz_id, choice_index | { correct: bool, stamp_count, ticket_issued: bool } | 있음 |
| poster | /api/poster/interest | POST | poster_id, choice(아래 선택지) | { saved: true } | 있음 |
| poster | /api/poster/stamps | GET | 없음 | { stamps: [...], total, tickets: [...] } | 있음 |
| ops | /api/ops/reset-pin | POST | participant_id | { pin } 새 무작위 4자리를 한 번만 돌려준다 | 있음 |
| ops | /api/ops/add-participant | POST | display_name, affiliation?, role, cohort?, is_host?, pin?, offer_text?, seek_text?, topic_tags? | { participant, pin } 워크인 추가 | 있음 |
| ops | /api/ops/compute | GET | 없음 | { reachable, model_loaded?, version? } 계산 서비스 상태. 운영자만 | 있음 |
| ops | /api/ops/compute | POST | job: precompute(전날) · checkin(체크인 마감) · coffeechat(포스터세션 중) | { job, ms, result } result 는 계산 서비스 응답(초안 version 등). 거절이면 409 COMPUTE_REFUSED. 운영자만 | 있음 |
| ops | /api/ops/checkin | POST | participant_id, is_late? | { checked_at } | 예정 |
| ops | /api/ops/publish | POST | version | { published_at, round, retired: [version] } 초안을 공개하고 같은 행사 · 라운드의 이전 공개 버전은 retired 로. 이미 공개 409 ALREADY_PUBLISHED, 철회본 409 RETIRED. 운영자만 | 있음 |
| ops | /api/ops/versions | GET | 없음 | { versions: [{version, round, status, created_at, published_at, summary}] } 이 행사 최신 20개. 운영자만 | 있음 |
| ops | /api/ops/versions/<version> | GET | 없음 | { version, round, status, tables: [{table_no, members: [{id, display_name, affiliation, role, random, reason}]}] } 배정 확인용. 운영자만 | 있음 |
| ops | /api/ops/status | GET | 없음 | { event_id, phase, participants, checkins, satisfaction: {answered, rate}, exchanges, compute_heartbeat: {at, last} 또는 null, published: {tabletalk, coffeechat: {version, published_at} 또는 null}, now } 상태판. 운영자만 | 있음 |

card 객체는 모든 card 응답에서 같은 모양이다: `{ id, display_name, affiliation, role, cohort, stage(1 명단만·2 프로필·3 주소), sid, label, theme(0~7 또는 null), offer_text, seek_text, topic_tags, links 또는 null, source?, exchanged_at? }`. 링크는 상대의 visibility 가 all 이거나 내가 그 사람을 직접 찍었을 때만 들어간다.

## 선택지 (만족도, 관심도)

숫자 점수 대신 문장을 고르게 한다. 요청에는 키를 보내고 화면에는 문구를 보여 준다. 목록의 정본은 코드다(tabletalk `app/api/tabletalk/_choices.ts`, poster `app/api/poster/_lib.ts`). 화면은 이 목록을 import 해서 순서대로 그린다.

| 경로 | 키 | 화면 문구 |
|---|---|---|
| /api/tabletalk/satisfaction | gained | 새로 얻은 게 있었다 |
| | different | 좋았지만 내 관심사와는 조금 달랐다 |
| | unsure | 잘 모르겠다 |
| | mismatch | 나와는 잘 안 맞았다 |
| /api/poster/interest | learn_more | 더 알아보고 싶다 |
| | interesting | 흥미로웠다 |
| | not_mine | 내 관심 분야는 아니다 |

## 계산 서비스 (services/compute, 내부 HTTP)

| 경로 | 방법 | 언제 | 하는 일 |
|---|---|---|---|
| /health | GET | 항상 | 모델·코드북 로드 여부 |
| /precompute | POST | 행사 전날 | 사전 등록자 전원 임베딩·코드북·주소·라벨 발급, 테이블토크 배정 draft 생성 |
| /coffeechat | POST | 테이블토크 종료 뒤(포스터세션 중) | 체크인 명단 + edges + satisfaction + poster_interest 로 점수 재계산, 커피챗 배정 draft, 추천 목록 생성 |

호출자는 헤더 `X-Compute-Secret` 을 보낸다. 결과는 계산 서비스가 DB 에 직접 쓰고 `assign_versions.version` 만 돌려준다.
