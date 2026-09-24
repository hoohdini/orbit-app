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

- 로그인: `POST /api/onboarding/login` (display_name, pin) 또는 (entry_token). 성공 시 httpOnly 쿠키 `orbit_session`(서명된 JWT, participant id, is_admin, 24시간).
- 로그아웃: `POST /api/onboarding/logout`.
- 관리자 경로(`/api/ops/*`)는 `requireAdmin()`.

## 경로 목록 (계약. 만들면서 한 줄씩 채운다)

| 모듈 | 경로 | 방법 | 입력 | 응답 data | 상태 |
|---|---|---|---|---|---|
| 공용 | /api/health | GET | 없음 | { version, db: ok/fail } | 있음 |
| onboarding | /api/onboarding/login | POST | display_name, pin 또는 entry_token | { participant: {id, display_name, role} } | 예정 |
| onboarding | /api/onboarding/consent | POST | agreed: true | { consent_at } | 예정 |
| onboarding | /api/onboarding/me | GET | 없음 | { participant, profile, table: {round, table_no, label} 또는 null } | 예정 |
| home | /api/home/orbit | GET | 없음 | { me: {sid_prefix, label}, rings: [{prefix_len, people: [{id, display_name, affiliation}]}] } | 예정 |
| card | /api/card/me | GET | 없음 | { card: {...}, qr_payload } | 예정 |
| card | /api/card/scan | POST | qr_payload | { saved_card: {...} } | 예정 |
| card | /api/card/wallet | GET | 없음 | { cards: [...] } | 예정 |
| tabletalk | /api/tabletalk/table | GET | 없음 | { table_no, label, members: [{id, display_name, affiliation, topic_tags, offer_text}] } | 예정 |
| tabletalk | /api/tabletalk/satisfaction | POST | score 1~5, comment? | { saved: true } | 예정 |
| coffeechat | /api/coffeechat/table | GET | 없음 | { table_no, label, talk_prompts, members: [...] } | 예정 |
| coffeechat | /api/coffeechat/recs | GET | 없음 | { recs: [{rank, target: {id, display_name, affiliation}, current_table_no, reason}] } | 예정 |
| poster | /api/poster/scan | POST | qr_payload | { poster: {id, title}, quiz: {id, question, choices} } | 예정 |
| poster | /api/poster/answer | POST | quiz_id, choice_index | { correct: bool, stamp_count, ticket_issued: bool } | 예정 |
| poster | /api/poster/interest | POST | poster_id, score 1~5 | { saved: true } | 예정 |
| poster | /api/poster/stamps | GET | 없음 | { stamps: [...], total, tickets: [...] } | 예정 |
| ops | /api/ops/checkin | POST | participant_id, is_late? | { checked_at } | 예정 |
| ops | /api/ops/publish | POST | version | { published_at } | 예정 |
| ops | /api/ops/status | GET | 없음 | { phase, checkins, satisfaction_rate, exchanges, compute_heartbeat } | 예정 |

## 계산 서비스 (services/compute, 내부 HTTP)

| 경로 | 방법 | 언제 | 하는 일 |
|---|---|---|---|
| /health | GET | 항상 | 모델·코드북 로드 여부 |
| /precompute | POST | 행사 전날 | 사전 등록자 전원 임베딩·코드북·주소·라벨 발급, 테이블토크 배정 draft 생성 |
| /coffeechat | POST | 테이블토크 종료 뒤 | 체크인 명단 + edges + satisfaction 으로 점수 재계산, 커피챗 배정 draft, 추천 목록 생성 |

호출자는 헤더 `X-Compute-Secret` 을 보낸다. 결과는 계산 서비스가 DB 에 직접 쓰고 `assign_versions.version` 만 돌려준다.
