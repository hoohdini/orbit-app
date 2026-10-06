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
| 공용 | /api/state | GET | 없음 | { phase, phase_label, phase_at, notice: {text, expires_at} 또는 null, consent(agreed · refused · pending), tabletalk: {version, table_no, seat_no} 또는 null, coffeechat: {version, group_no} 또는 null, published: {tabletalk, coffeechat}(공개 버전 번호 또는 null), recs_open, mission: {window(not_started · open · closed), done_count, total, progress}, now } 참가자 화면이 15초마다 부르는 상태 하나(v0.2 B-09). 상태 띠(H-01) · 추천 접힘(H-04) · 만족도 노출(N-03) · 새 배정 안내(N-06, published 와 기기에 저장한 확인 버전을 비교) · 미션(E-01) | 있음 |
| onboarding | /api/onboarding/login | POST | display_name, pin(숫자 4자리), participant_id? | { participant: {id, display_name, role, is_admin}, consented } 또는 동명이인이면 { choose: [{id, display_name, affiliation, role, cohort}] }. 실패 401, 5회 실패 후 10분 423 | 있음 |
| onboarding | /api/onboarding/logout | POST | 없음 | { ok } | 있음 |
| onboarding | /api/onboarding/consent | POST | agreed: true 또는 false | { consent, consent_at, consent_refused_at } 거부도 저장한다(v0.2 H-00). 다시 동의하면 거부 기록을 지운다 | 있음 |
| onboarding | /api/onboarding/me | GET | 없음 | { participant, profile, consented, consent(agreed · refused · pending), sid: {offer_sid, seek_sid, label, is_temp} 또는 null, table: {table_no, label, version, seat_no} 또는 null } 첫 진입 카드(H-00)가 테이블 · 좌석 번호를 쓴다 | 있음 |
| home | /api/home/orbit | GET | 없음 | { me: {sid_prefix, label}, rings: [{prefix_len, people: [{id, display_name, affiliation}]}] } | 예정 |
| card | /api/card/me | GET | 없음 | { card, visibility, qr_payload, wallet_count, unseen_count } qr_payload 는 명찰과 같은 `<origin>/card?p=<id>` | 있음 |
| card | /api/card/scan | POST | qr_payload, source?(qr 기본, manual), via?(card · event, 스캐너를 연 탭) | { card, already_saved, status(confirmed · pending), ask_first_meet } 한 번 찍으면 양방향 2행(나→상대 source, 상대→나 auto). qr 은 바로 성립, manual(이름 검색)은 상대 확인 전 pending(v0.2 H-05-BE2). pending 인 사이를 QR 로 찍으면 바로 성립. ask_first_meet 이 true 면 교환 결과 화면에서 오늘 처음 대화한 분인가요? 를 묻는다. 본인 400 SELF_SCAN, 다른 행사·형식 오류 404, 상대가 동의 거부 409 TARGET_UNAVAILABLE | 있음 |
| card | /api/card/wallet | GET | 없음 | { cards: [card…], received_count } 최근 순. card.source 가 auto 면 받은 것. card.status 가 pending 이면 상대 확인 전, first_meet · note 는 내가 고른 답 | 있음 |
| card | /api/card/inbox | GET | 없음 | { new: [{exchange_id, message, card, ask_first_meet}], count, requests: [{exchange_id, message, card}] } new 는 아직 안 본 "OO 님에게 명함이 공유되었습니다"(성립한 것만). ask_first_meet 이면 받은 쪽도 오늘 처음 대화한 분인가요? 를 한 번 묻는다. requests 는 상대가 이름 검색으로 보낸 확인 요청(OO님과 명함을 교환하셨나요?) | 있음 |
| card | /api/card/confirm | POST | exchange_id(requests 의 것), accept | { status(confirmed · rejected), confirmed_at } 이름 검색 교환 확인. 거절하면 두 행을 지운다. 내 요청이 아니면 404, 이미 성립 409 NOT_PENDING(v0.2 H-05-BE2) | 있음 |
| card | /api/card/first-meet | POST | target_id, first_meet(true · false · null 건너뛰기), note?(100자) | { first_meet, first_meet_at, note } 오늘 처음 대화한 분인가요? 와 한 줄 남기기. 내 행에만 쓴다. 성립한 교환이 아니면 404(v0.2 H-05, 미션 ③) | 있음 |
| card | /api/card/recs | GET | 없음 | { folded, people: [{id, display_name, affiliation, role, cohort, career_line}], almost_done } 오늘 만나면 좋을 분 3명(v0.2 H-04). 계산 서비스 recs(커피챗 공개 뒤면 그 버전, 전이면 테이블토크 버전)를 거르기만 한다: 교환한 사람 · 동석자 · 미체크인 · 동의 거부자 제외, 최근 10분 3건 이상 받은 사람은 뒤로(이미 내게 보인 사람은 그대로). 보여 준 사람은 rec_impressions 에 처음 시각을 남긴다(미션 ②). 단계 tabletalk · tabletalk_end · coffeechat_seated 에는 folded true. 순위 · 점수 · 근거는 주지 않는다 | 있음 |
| card | /api/card/inbox/seen | POST | exchange_ids?(비우면 전부) | { seen: n } | 있음 |
| card | /api/card/search | GET | q(2자 이상) | { people: [{id, display_name, affiliation}] } 같은 행사·체크인·본인 제외·동의 거부자 제외·10명. 카메라 대체 경로 | 있음 |
| card | /api/card/keyword | GET | q(2~30자) | { q, aliases, total, semantic, people: [{id, display_name, affiliation, cohort, career_line, offer_text, matched_fields: ["관심 태그"·"하는 일"·"뜻이 가까움"], matched_tags, exchanged}] } 글자 검색(줄임말 사전 _aliases.json 의 같은 뜻 다른 표기도 함께, aliases = 함께 찾은 표기) + 뜻 검색(계산 서비스 /search, 0.5초 넘으면 글자만, semantic=false)을 합쳐 추천 점수(상호 점수) 높은 순 20명. 찾는 사람 문장은 주지 않음. 체크인 · 동의한 사람끼리, 본인 제외. 검색어는 event_log(keyword_search) | 시제품(민찬 제안 10/5, 회의 채택 전) |
| card | /api/card/keyword/open | POST | q, target_id | { saved } 검색 결과에서 사람을 열어 봄(event_log keyword_open). 계산 서비스가 추천에 반영 | 시제품 |
| card | /api/card/twolist | GET | 없음 | { anchor: {id, display_name} 또는 null, similar: [사람 3], different: [사람 3] } 가장 최근 교환한 사람과 하는 일이 비슷한 쪽 · 다른 쪽에서 추천 점수 높은 3명씩. 오늘 교환한 사람 쪽으로 찾는 방향을 옮겨 점수. 교환한 사람 · 동석자 제외. event_log(twolist_shown) | 시제품(민찬 제안 10/5) |
| card | /api/card/tags | GET | q?(자동완성) | { tags: [{tag, count}] } 다른 참가자들의 관심 태그와 사람 수(검색과 같은 범위). 눌러서 찾기용. q 를 주면 그 글자(또는 같은 뜻 다른 표기)가 든 태그만 사람 많은 순 8개. 동의 · 체크인 전이면 403 | 시제품(민찬 제안 10/5, 회의 채택 전) |
| card | /api/card/settings | POST | visibility?(all·scanned), links?({linkedin, github, email, url}) | { visibility, links } | 있음 |
| tabletalk | /api/tabletalk/table | GET | 없음 | { table_no, label, members: [{id, display_name, affiliation, role, cohort, seat_no, topic_tags, career_line, offer_text}] } 좌석 순서(나부터 시계 방향). career_line = 하는 일 첫 문장(v0.2 N-02) | 있음 |
| tabletalk | /api/tabletalk/satisfaction | POST | choice(아래 선택지), picks?(uuid 배열), elapsed_ms?, comment?, round?(tabletalk 기본 · coffeechat) | { saved: true, round } 라운드마다 1건, 다시 내면 덮어씀(v0.2 N-03). 화면 질문은 '이번 테이블에서 새로 얻은 게 있었나요?'. picks 는 같은 화면 아래 선택 질문(이런 분을 더 만나 보고 싶다 싶었던 분이 있나요?)의 답으로, 그 라운드에 나와 같은 테이블인 사람만 받는다(아니면 400, 배정이 없으면 409 NOT_SEATED). 고른 사람에게는 알리지 않는다. elapsed_ms 는 질문이 뜬 뒤 제출까지 걸린 시간(화면이 잼, 1초 미만은 계산에서 뺌). 띄우는 방식: 라운드가 끝나면 전면 카드로 바로 띄우고 작은 '나중에'를 두며, 나중에를 누르면 포스터 스탬프판에서 한 번 더(최대 2번). 미리 선택된 칸 없음. 다시 내면 덮어쓰되 picks · elapsed_ms 는 보낸 경우에만 바꾼다(10/6) | 있음 |
| tabletalk | /api/tabletalk/orbit | GET | round?(tabletalk 기본 · coffeechat) | { round, version, me: {table_no, grid}, inner: [{id, display_name, affiliation}], outer: [{table_no, label, grid}] } 궤도(v0.2 N-01 · N-05). inner 는 같은 테이블 사람을 나와 가까운 순서로(최대 9, 점수는 안 줌, 동의 거부자 제외). outer 는 다른 테이블의 대표 라벨만(개인 이름 없음). grid 는 3×3 배치 위치 {row, col}(1번 왼쪽 위), 커피챗은 null 이고 그룹이 8개 넘으면 나와 가까운 8개만. 배정 공개 전 404 NOT_PUBLISHED | 있음 |
| tabletalk | /api/tabletalk/satisfaction | GET | round?(tabletalk 기본 · coffeechat) | { round, answered, choice, picks } 전면 카드를 다시 띄우지 않으려고 | 있음 |
| coffeechat | /api/coffeechat/table | GET | 없음 | { group_no, table_no(같은 값), label, talk_prompts(예전 화면용), members: [{id, display_name, affiliation, role, cohort, topic_tags, career_line, offer_text, reason}] } reason = 근거 한 줄 또는 null(v0.2 N-04 · B-07) | 있음 |
| coffeechat | /api/coffeechat/recs | GET | 없음 | { recs: [{rank, target: {id, display_name, affiliation}, current_table_no, reason}] } | 있음 |
| poster | /api/poster/scan | POST | qr_payload | { poster: {id, code, title, presenter}, reasons: [{key, label}](흥미 3단계, 고정 순서), my_reason, quiz: {id, question, choices} 또는 null } 퀴즈 없는 포스터도 스캔된다(v0.2 E-02). 화면 질문은 '오늘 이 분야와 관련된 분을 더 만나 보고 싶나요?', 선택지 아래 '어떤 답이든 스탬프는 받아요' | 있음 |
| poster | /api/poster/response | POST | poster_id, reason(아래 선택지), shown_order | { saved, count, goal: 2, done } 최근 15분 스캔 필요, 재응답은 덮어씀, 어떤 답이든 제출하면 그 포스터 스탬프(미션 ①) | 있음 |
| poster | /api/poster/answer | POST | quiz_id, choice_index | { correct: bool, stamp_count, ticket_issued: false } 퀴즈는 선택이고 이지선다(10/5 회의). 시도는 포스터마다 1번(POSTER_MAX_ATTEMPTS, 기본 1). 정답이어도 스탬프 · 응모권 없음(v0.2 E-02 · 결정 6) | 있음 |
| poster | /api/poster/interest | POST | poster_id, choice(아래 선택지) | { saved: true } 예전 화면용. v0.2 부터는 /api/poster/response | 있음 |
| poster | /api/poster/stamps | GET | 없음 | { stamps: [...], total, tickets: [...] } | 있음 |
| poster | /api/poster/missions | GET | 없음 | { window(not_started · open · closed), closed_at, missions: [{key(poster · recommended · first_meet · generation), label, goal, count, done, completed_at}], done_count, total, progress, completed_all_at } 이벤트 탭 미션 현황판(v0.2 E-01 ~ E-06). 판정은 서버(lib/missions.ts). 교환은 성립한 것만, 마감(closed_at) 뒤 기록은 세지 않는다. 진행도 = 네 미션 min(달성/목표, 1) 평균. 세대 연결의 구분은 재학생(student)과 그 밖 | 있음 |
| ops | /api/ops/reset-pin | POST | participant_id | { pin } 새 무작위 4자리를 한 번만 돌려준다 | 있음 |
| ops | /api/ops/add-participant | POST | display_name, affiliation?, role, cohort?, is_host?, pin?, offer_text?, seek_text?, topic_tags?, assign_seat?(기본 true) | { participant, pin, seat: {version, table_no, seat_no} 또는 null } 워크인 추가. 공개된 테이블토크가 있으면 고정 테이블을 뺀 가장 적은 테이블의 끝 좌석에 바로 넣는다(v0.2 A-05) | 있음 |
| ops | /api/ops/compute | GET | 없음 | { reachable, model_loaded?, version? } 계산 서비스 상태. 운영자만 | 있음 |
| ops | /api/ops/compute | POST | job: precompute(전날) · checkin(체크인 마감) · coffeechat(포스터세션 중) | { job, ms, result } result 는 계산 서비스 응답(초안 version 등. checkin 은 새 초안이 없어 version 이 null). 거절이면 409 COMPUTE_REFUSED. 운영자만 | 있음 |
| ops | /api/ops/participants | GET | 없음 | { participants: [{id, display_name, affiliation, role, cohort, is_host, is_admin, consented, consent_refused, has_sid, checked_at, is_late}] } 이 행사 전원. 운영자만 | 있음 |
| ops | /api/ops/checkin | POST | participant_id, is_late? | { checked_at, is_late, already } 수동 체크인. 이미 돼 있으면 already true. 운영자만 | 있음 |
| ops | /api/ops/labels | GET | 없음 | { codebook_version, labels: [{prefix, label, members}] } 활성 코드북의 이름표. 운영자만 | 있음 |
| ops | /api/ops/labels | POST | codebook_version, prefix, label | { saved: true } 이름표 한 줄 수정. 활성 코드북이 아니면 409 NOT_ACTIVE. 운영자만 | 있음 |
| ops | /api/ops/poster | GET | 없음 | { posters: [{id, code, title, presenter, booth, stamps, interest}], stamps_total, people_with_stamps, tickets_total, people_with_tickets, raffle } 포스터세션 현황. 운영자만 | 있음 |
| ops | /api/ops/raffle | POST | n | { at, n, winners: [{id, display_name, affiliation, tickets}] } 응모권 1장 1표, 한 사람 한 번. 응모권 없으면 409 NO_TICKETS. 운영자만 | 있음 |
| ops | /api/ops/unpublish | POST | version | { retired, round } 공개 철회(비상용). 공개 중이 아니면 409 NOT_PUBLISHED. 운영자만 | 있음 |
| ops | /api/ops/publish | POST | version | { published_at, round, retired: [version] } 초안을 공개하고 같은 행사 · 라운드의 이전 공개 버전은 retired 로. 이미 공개 409 ALREADY_PUBLISHED, 철회본 409 RETIRED. 운영자만 | 있음 |
| ops | /api/ops/versions | GET | 없음 | { versions: [{version, round, status, created_at, published_at, summary}] } 이 행사 최신 20개. 운영자만 | 있음 |
| ops | /api/ops/versions/<version> | GET | 없음 | { version, round, status, metrics: {groups, sizes, size_min, size_max, mean_score, low_score, check_tables, reunion_pairs(커피챗만, 아니면 null), cohort_over, not_checked_in}, tables: [{table_no, mean_score, check, members: [{id, display_name, affiliation, role, cohort, seat_no, random, reason}]}] } 배정 확인용(v0.2 A-03). 점수는 그 버전 pair_scores 의 테이블 안 쌍 평균. check 는 평균보다 1 표준편차 넘게 낮은 테이블(없으면 가장 낮은 하나). 기수 초과 상한은 계산 서비스와 같다(테이블토크 3, 커피챗 2). 운영자만 | 있음 |
| ops | /api/ops/swap | POST | version, a, b(participant id) | { version(새 초안), source_version, round, delta, before, after } 수동 교체(v0.2 A-04). 원본은 두고 복사본 초안을 만들어 두 사람의 테이블 · 좌석을 맞바꾼다. delta 는 두 사람이 낀 테이블 안 쌍 점수 합의 변화. 같은 테이블 409 SAME_TABLE, 철회본 409 RETIRED. 공개는 /api/ops/publish. 운영자만 | 있음 |
| ops | /api/ops/phase | POST | phase(아래 단계 값), reopen_missions? | { phase, phase_label, at, mission_closed_at } 단계 전환(v0.2 A-02). 처음 wrapup · award 로 넘어갈 때 미션 마감 시각을 고정한다(reopen_missions true 면 마감을 지운다). 운영자만 | 있음 |
| ops | /api/ops/notice | POST | preset?(start · move · last5) 또는 text?(80자), minutes?(기본 5), clear? | { notice: {text, preset, expires_at} 또는 null } 공지 송출(v0.2 A-06). 만료까지 /api/state 의 notice 로 나간다. clear true 면 내린다. 운영자만 | 있음 |
| ops | /api/ops/audit | GET | limit?(기본 50) | { entries: [{id, kind, actor: {id, display_name}, payload, at}] } 감사 로그(v0.2 A-09). 단계 전환 · 공지 · 공개 · 철회 · 수동 교체 · 계산 · 체크인 · 이름표 · 추첨 · 시상 제외 · 워크인 · 숫자 재발급. 운영자만 | 있음 |
| ops | /api/ops/missions | GET | 없음 | { window, closed_at, checked_in, avg_progress, completed_all, by_mission: [{key, label, done}], excluded, candidates: [{place, id, display_name, affiliation, progress, done_count, valid_poster_responses, first_meet_exchanges, completed_all_at}], qr: {card_scans, poster_scans, tab_mismatch} } 이벤트 · 미션 · 시상 현황(v0.2 A-07, 결정 12). 후보는 제외 명단을 뺀 상위 20명, 진행도 → 유효 포스터 응답 수(5초 이상) → 첫 대화 확인 교환 수 → 4/4 완료 시각 순. 탭 불일치 = 명함 QR 을 이벤트 탭에서 · 포스터 QR 을 명함 탭에서 읽은 수. 운영자만 | 있음 |
| ops | /api/ops/award-exclude | GET | 없음 | { people: [{id, display_name, affiliation}], at } 특별 시상 제외 명단(v0.2 E-06). 운영자만 | 있음 |
| ops | /api/ops/award-exclude | POST | csv?(한 줄에 이름,소속), ids? | { people, unmatched: [줄], at } 명단을 통째로 바꾼다. 이름이 없거나 동명이인을 못 가리면 unmatched. 운영자만 | 있음 |
| ops | /api/ops/print | GET | round?(tabletalk 기본 · coffeechat), version? | 인쇄용 HTML(JSON 아님). 테이블별 좌석 순 명단(v0.2 A-10). 브라우저 인쇄로 PDF 저장. version 없으면 그 라운드 공개 버전. 운영자만 | 있음 |
| ops | /api/ops/status | GET | 없음 | { event_id, phase, phase_label, phase_at, participants, checkins, satisfaction: {answered, rate}, satisfaction_by_round: {tabletalk, coffeechat: {answered, rate}}, skew: {gini, zero_received}, exchanges, compute_heartbeat: {at, last} 또는 null, published: {tabletalk, coffeechat: {version, published_at} 또는 null}, now } 상태판. 교환은 성립한 것만. skew 는 체크인한 사람이 받은 교환 수의 지니 계수(0 고르게, 1 한 사람에게 몰림)와 한 건도 못 받은 사람 수(v0.2 A-01). 무응답률 = 1 - rate. 운영자만 | 있음 |

card 객체는 모든 card 응답에서 같은 모양이다: `{ id, display_name, affiliation, role, cohort, stage(1 명단만·2 프로필·3 주소), sid, label, theme(0~7 또는 null), offer_text, seek_text, topic_tags, links 또는 null, source?, exchanged_at? }`. 링크는 상대의 visibility 가 all 이거나 내가 그 사람을 직접 찍었을 때만 들어간다.

## 동의 거부자 (v0.2 H-00, 10/5 회의)

동의를 거부한 사람도 사전 등록 정보로 배정(테이블토크 · 커피챗)에는 들어간다. 행사 중 수집 쓰기(/api/card/scan · confirm · first-meet · recs, /api/poster/scan · response · answer · interest, /api/tabletalk/satisfaction POST, 검색 시제품)는 403 CONSENT_REFUSED(아직 고르지 않았으면 CONSENT_REQUIRED)를 돌려준다. 남의 추천 · 이름 검색 · 궤도에서도 빠진다. 판정은 `lib/consent.ts`.

## 행사 단계 (v0.2 A-02, `lib/phase.ts`)

| 값 | 식순 | 추천 목록 | 미션 |
|---|---|---|---|
| before | 행사 전 | 열림 | 곧 시작 |
| checkin | 등록 · 개회 | 열림 | 곧 시작 |
| tabletalk | 서비스 소개 · 테이블토크 | 접힘 | 진행 |
| tabletalk_end | 테이블토크 마무리(만족도) | 접힘 | 진행 |
| poster | 포스터 세션 | 열림 | 진행 |
| coffeechat_seated | 커피챗 첫 배치 | 접힘 | 진행 |
| coffeechat_free | 커피챗 자유 이동 | 열림 | 진행 |
| wrapup | 마무리(커피챗 만족도) | 열림 | 마감, 읽기 전용 |
| award | 시상 · 추첨 | 열림 | 마감, 읽기 전용 |

## 선택지 (만족도, 관심도)

숫자 점수 대신 문장을 고르게 한다. 요청에는 키를 보내고 화면에는 문구를 보여 준다. 목록의 정본은 코드다(tabletalk `app/api/tabletalk/_choices.ts`, poster `app/api/poster/_lib.ts`). 화면은 이 목록을 import 해서 순서대로 그린다.

| 경로 | 키 | 화면 문구 |
|---|---|---|
| /api/tabletalk/satisfaction(0012 부터, 키는 그대로 문구만 바꿈) | gained | 많이 얻었어요 |
| | different | 조금 얻었어요 |
| | mismatch | 잘 맞지 않았어요 |
| /api/poster/response(0011 부터) | want | 꼭 만나 보고 싶어요 |
| | maybe | 기회가 되면 좋아요 |
| | not_mine | 제 관심 분야는 아니에요 |
| /api/poster/interest(예전 화면) | learn_more | 더 알아보고 싶다 |
| | interesting | 흥미로웠다 |
| | not_mine | 내 관심 분야는 아니다 |

## 계산 서비스 (services/compute, 내부 HTTP)

| 경로 | 방법 | 언제 | 하는 일 |
|---|---|---|---|
| /health | GET | 항상 | 모델·코드북 로드 여부 |
| /precompute | POST | 행사 전날 | 사전 등록자 전원 임베딩·코드북·주소·라벨 발급, 테이블토크 배정 · 좌석 draft(1번 고정 + 2~9번), 전날 추천 목록. reuse_codebook=true 면 현장 등록자 주소만 |
| /search | POST | 사람 찾기 때(시제품) | q(2~30자), viewer_id, aliases?(웹 줄임말 사전의 같은 뜻 다른 표기, 최대 20) → { q, people: [{id, score}], all_scores } 하는 일 문장 · 관심 태그 중 검색어와 가장 가까운 것의 cos 를 그 사람 점수로(문장별 최고), 평균 + 1 표준편차 이상 최대 10. aliases 는 검색어 뒤 괄호로 붙여 벡터로 바꿈. score 는 웹 정렬 · 거르기용, 화면에 안 냄. WARM_MODEL=1 이면 켤 때 모델을 미리 올림 |
| /coffeechat | POST | 포스터 응답 마감 뒤(16:45) | 체크인 명단 + 명함 교환 + 테이블토크 만족도 + 포스터 응답(docs/DATA_SPEC.md 규칙) 으로 점수 재계산, 3~4명 그룹 draft, 그룹 카드 근거 한 줄, 자유 이동 추천 목록 |

호출자는 헤더 `X-Compute-Secret` 을 보낸다. 결과는 계산 서비스가 DB 에 직접 쓰고 `assign_versions.version` 만 돌려준다.
