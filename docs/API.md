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

- 로그인: `POST /api/onboarding/login` (display_name, pin). 성공 시 httpOnly 쿠키 `orbit_session`(서명된 JWT, participant id, is_admin, 24시간). 첫 로그인은 checkins 에 자동 기록된다. 이 첫 체크인이 커피챗 배정 공개 뒤면 그때 커피챗 자리를 준다(아래 늦게 온 사람의 커피챗 자리, 10/25).
- 로그아웃: `POST /api/onboarding/logout`.
- 관리자 경로(`/api/ops/*`)는 `requireAdmin()`.

## 경로 목록 (계약. 만들면서 한 줄씩 채운다)

| 모듈 | 경로 | 방법 | 입력 | 응답 data | 상태 |
|---|---|---|---|---|---|
| 공용 | /api/health | GET | 없음 | { version, db: ok/fail } | 있음 |
| 공용 | /api/state | GET | 없음 | { phase, phase_label, phase_at, notice: {text, expires_at} 또는 null, consent(agreed · refused · pending), share(명함 공개 및 추천 활용, 0014), tabletalk: {version, table_no, seat_no} 또는 null, coffeechat: {version, group_no, seat_no(10/23 부터, 예전 버전은 null)} 또는 null, published: {tabletalk, coffeechat}(공개 버전 번호 또는 null), recs_open, checked_in, left_at(일찍 나간다고 표시한 시각 또는 null, 0019), leave_open(조기 퇴장을 받는 단계인지), leave_available(DB 에 0019 가 있는지, false 면 화면이 버튼을 숨김), mission: {window(not_started · open · closed), done_count, total, progress(= done_count / total, 10/22)}, now } 참가자 화면이 15초마다 부르는 상태 하나(v0.2 B-09). 상태 띠(H-01) · 추천 접힘(H-04) · 만족도 노출(N-03) · 새 배정 안내(N-06, published 와 기기에 저장한 확인 버전을 비교) · 미션(E-01) · 조기 퇴장(10/25, left_at 이 있으면 재입장을 보임) | 있음 |
| 공용 | /api/checkin/leave | POST | undo?(기본 false) | { left_at } 조기 퇴장(10/25 민찬 결정, 아래 일찍 나가는 사람 절). 본인 표시(left_by null), undo true 면 재입장(left_at 을 비움). 이미 같은 상태면 그대로 두고 같은 값(쓰기에 상태 조건을 걸어 동시에 두 번 눌러도 처음 시각 유지). 체크인 안 했으면 409 NOT_CHECKED_IN, 등록 · 개회 ~ 커피챗 단계가 아니면 409 LEAVE_NOT_OPEN, DB 에 0019 가 없으면 503 LEAVE_UNAVAILABLE. event_log checkin_leave · checkin_leave_undo | 있음 |
| onboarding | /api/onboarding/login | POST | display_name, pin(숫자 4자리), participant_id? | { participant: {id, display_name, role, is_admin}, consented } 또는 동명이인이면 { choose: [{id, display_name, affiliation, role, cohort}] }. 실패 401, 5회 실패 후 10분 423 | 있음 |
| onboarding | /api/onboarding/logout | POST | 없음 | { ok } | 있음 |
| onboarding | /api/onboarding/consent | POST | agreed: true 또는 false, item?(collect · share) | { consent, consent_at, consent_refused_at, share, share_consent_at, share_refused_at } 거부도 저장한다(v0.2 H-00). 다시 동의하면 거부 기록을 지운다. 10/11(0014) 동의 두 항목: collect = 개인정보 수집 및 이용, share = 명함 공개 및 추천 활용. item 을 빼면 두 항목을 같이 정한다(온보딩), 마이페이지 내 정보는 항목별로 보낸다 | 있음 |
| onboarding | /api/onboarding/me | GET | 없음 | { participant, profile, consented, consent(agreed · refused · pending), consents: {collect, share: {state, at}}(0014, 마이페이지 내 정보의 날짜), sid: {offer_sid, seek_sid, label, is_temp} 또는 null, table: {table_no, label, version, seat_no} 또는 null } 첫 진입 카드(H-00)가 테이블 · 좌석 번호를 쓴다 | 있음 |
| home | /api/home/orbit | GET | 없음 | { me: {sid_prefix, label}, rings: [{prefix_len, people: [{id, display_name, affiliation}]}] } | 예정 |
| card | /api/card/me | GET | 없음 | { card, visibility, qr_payload, wallet_count, unseen_count } qr_payload 는 명찰과 같은 `<origin>/card?p=<id>` | 있음 |
| card | /api/card/scan | POST | qr_payload, source?(qr 기본, manual), via?(card · event, 스캐너를 연 탭) | { card, already_saved, status(confirmed · pending), ask_first_meet } 한 번 찍으면 양방향 2행(나→상대 source, 상대→나 auto). qr 은 바로 성립, manual(이름 검색)은 상대 확인 전 pending(v0.2 H-05-BE2). pending 인 사이를 QR 로 찍으면 바로 성립. ask_first_meet 이 true 면 교환 결과 화면에서 오늘 처음 대화한 분인가요? 를 묻는다. 본인 400 SELF_SCAN, 다른 행사·형식 오류 404, 상대가 동의 거부(이용 또는 명함 공개, 0014) 409 TARGET_UNAVAILABLE, 내가 명함 공개 거부 403 SHARE_REFUSED | 있음 |
| card | /api/card/wallet | GET | 없음 | { cards: [card…], received_count } 최근 순. card.source 가 auto 면 받은 것. card.status 가 pending 이면 상대 확인 전, first_meet · note 는 내가 고른 답과 메모. card.met 은 어디서 만났나 칩(table · poster · coffeechat · other, 교환 때 단계로 정함, 0013. other 는 전체에만), card.together 는 함께 있던 자리 {table_no, group_no}(공개 배정에서 나와 같은 테이블토크 테이블 · 커피챗 그룹이면 그 번호, 아니면 null) | 있음 |
| card | /api/card/inbox | GET | 없음 | { new: [{exchange_id, message, card, ask_first_meet}], count, requests: [{exchange_id, message, card}] } new 는 아직 안 본 "OO님에게 명함이 공유되었습니다"(성립한 것만). QR 교환인지 이름 검색 교환인지는 주지 않는다. ask_first_meet 이면 받은 쪽도 오늘 처음 대화한 분인가요? 를 한 번 묻는다. requests 는 상대가 이름 검색으로 보낸 확인 요청(OO님과 명함을 교환하셨나요?) | 있음 |
| card | /api/card/confirm | POST | exchange_id(requests 의 것), accept | { status(confirmed · rejected), confirmed_at } 이름 검색 교환 확인. 거절하면 두 행을 지운다. 내 요청이 아니면 404, 이미 성립 409 NOT_PENDING(v0.2 H-05-BE2) | 있음 |
| card | /api/card/first-meet | POST | target_id, first_meet(true · false · null 건너뛰기), note?(200자) | { first_meet, first_meet_at, note } 오늘 처음 대화한 분인가요? 와 한 줄 남기기. 내 행에만 쓴다. 성립한 교환이 아니면 404(v0.2 H-05, 시상 동점 처리에만 쓴다) | 있음 |
| card | /api/card/note | POST | target_id, note(200자, 빈 문자열이면 지움) | { note } 명함 상세의 메모 저장(10/11). first_meet 답은 건드리지 않는다. 내 행에만 쓰고 확인 대기(pending) 교환에도 쓸 수 있다. 교환한 사이가 아니면 404 | 있음 |
| card | /api/card/recs | GET | 없음 | { folded, version, people: [{rank, id, display_name, affiliation, role, cohort, career_line, offer_text, exchanged, checked_in}], almost_done } 오늘 만나면 좋을 분 10명 번호 목록(v0.2 H-04, 10/10 회의 · 10/11 결정). 행사 전에 정한 목록을 행사 내내 그대로 쓴다: 행사 직후 추천(커피챗 라운드 params.kind final)이 공개됐으면 그 버전, 아니면 공개된 테이블토크(전날 계산) 버전. 보통 커피챗 계산 목록은 쓰지 않는다. rank 는 가까운 순서(1부터 다시 매김), offer_text 는 하는 일 원문. 빼는 사람은 본인과 동의 거부자뿐이고 이미 교환한 사람은 exchanged true, 체크인 전은 checked_in false 로 표시만 한다. 보여 준 사람은 rec_impressions 에 처음 시각을 남긴다(시상 순위의 추천 인물 교환 판정 · 행사 뒤 분석, 10/23). 단계 tabletalk · tabletalk_end · coffeechat_seated 에는 folded true. almost_done 은 목록 전원과 교환했을 때 true. 점수 · 근거는 주지 않는다 | 있음 |
| card | /api/card/inbox/seen | POST | exchange_ids?(비우면 전부) | { seen: n } | 있음 |
| card | /api/card/search | GET | q(2자 이상) | { people: [{id, display_name, affiliation}] } 같은 행사·체크인·본인 제외·동의 거부자 제외·10명. 카메라 대체 경로 | 있음 |
| card | /api/card/settings | POST | visibility?(all·scanned), links?({linkedin, github, email, url}) | { visibility, links } | 있음 |
| my | /api/my/profile | GET · POST | POST: offer_text?, seek_text?, topic_tags?(5개), seek_tags?(5개) | { offer_text, seek_text, topic_tags, seek_tags, edited, visibility, links } 마이페이지 명함 편집(10/11 피그마). 태그는 Offer(topic_tags, 명함의 INTERESTS)와 Seek(seek_tags)가 따로다(10/21). seek_tags 처음 값은 사전 등록 관계 태그(intent_tags). 고친 값은 profiles.card_edit(0014)에만 저장해 명함에만 보이고 추천 · 배정 계산에는 쓰지 않는다. 글자 80(화면), 서버는 300까지 | 있음 |
| my | /api/my/tags | GET | q? | { tags: [태그] } 관심 태그 고르기. 이 행사 프로필의 주제 태그 모음에서 찾는다(사람은 돌려주지 않음). q 가 없으면 많이 쓰인 20개 | 있음 |
| tabletalk | /api/tabletalk/table | GET | 없음 | { table_no, label, members: [{id, display_name, affiliation, role, cohort, seat_no, topic_tags, career_line, offer_text, seek_text}] } 좌석 순서(나부터 시계 방향). career_line = 하는 일 첫 문장(v0.2 N-02) | 있음 |
| tabletalk | /api/tabletalk/satisfaction | POST | choice(아래 선택지), picks?(uuid 배열), elapsed_ms?, comment?, round?(tabletalk 기본 · coffeechat) | { saved: true, round } 라운드마다 1건, 다시 내면 덮어씀(v0.2 N-03). 화면 질문은 '이번 테이블 배정은 어땠나요?' / '이번 커피챗 테이블 배정은 어땠나요?'(10/22 그룹 → 테이블)(_choices.ts SATISFACTION_QUESTION). picks 는 같은 화면 아래 선택 질문(이런 분을 더 만나 보고 싶다 싶었던 분이 있나요?)의 답으로, 그 라운드에 나와 같은 테이블인 사람만 받는다(아니면 400, 배정이 없으면 409 NOT_SEATED). 고른 사람에게는 알리지 않는다. elapsed_ms 는 질문이 뜬 뒤 제출까지 걸린 시간(화면이 잼, 2초 미만은 계산에서 뺌). 미리 선택된 칸 없음. 넘기기 방식(건너뛰기 · 나중에 · 강제)은 팀 결정 대기. 다시 내면 덮어쓰되 picks · elapsed_ms · comment 는 보낸 경우에만 바꾼다(10/6). picks 의 동의 거부자는 오류 없이 뺀다. elapsed_ms 는 소수도 받고 반올림해 0 ~ 3,600,000 으로 자른다 | 있음 |
| tabletalk | /api/tabletalk/satisfaction | GET | round?(tabletalk 기본 · coffeechat) | { round, answered, choice, picks, candidates: [{id, display_name}] } answered 는 전면 카드를 다시 띄우지 않으려고. candidates = 고를 수 있는 사람(그 라운드 같은 테이블에서 나 · 동의 거부자 뺌, 이름순). 배정이 없으면 빈 목록 | 있음 |
| tabletalk | /api/tabletalk/orbit | GET | round?(tabletalk 기본 · coffeechat) | { round, version, me: {table_no, grid}, inner: [{id, display_name, affiliation}], outer: [{table_no, label, grid}] } 궤도(v0.2 N-01 · N-05). inner 는 같은 테이블 사람을 나와 가까운 순서로(최대 9, 점수는 안 줌, 동의 거부자 제외). outer 는 다른 테이블의 대표 라벨만(개인 이름 없음). grid 는 3×3 배치 위치 {row, col}(1번 왼쪽 위), 커피챗은 null 이고 그룹이 8개 넘으면 나와 가까운 8개만. 배정 공개 전 404 NOT_PUBLISHED | 있음 |
| coffeechat | /api/coffeechat/table | GET | 없음 | { group_no, table_no(같은 값), label, talk_prompts(예전 화면용), members: [{id, display_name, affiliation, role, cohort, seat_no, topic_tags, career_line, offer_text, seek_text, reason}] } reason = 근거 한 줄 또는 null(v0.2 N-04 · B-07). 좌석 번호가 있으면(10/23 부터) 테이블토크처럼 좌석 순서로 나부터 시계 방향, 없으면(예전 버전) 나 → 이름순 | 있음 |
| coffeechat | /api/coffeechat/recs | GET | 없음 | { recs: [{rank, target: {id, display_name, affiliation}, current_table_no, reason}] } | 있음 |
| poster | /api/poster/scan | POST | qr_payload, via? | { poster: {id, code, title, presenter, tags, booth, summary}, reasons: [{key, label}](흥미 3단계, 고정 순서), my_reason, quiz: {id, question, choices} 또는 null, quiz_solved, solved_choice(내가 맞힌 답, 아니면 null), progress: {responses, poster_goal, quiz_stamps, quiz_goal} } 퀴즈 없는 포스터도 스캔된다(v0.2 E-02). 화면 질문은 '오늘 이 분야와 관련된 분을 더 만나 보고 싶나요?'(선택지 아래 안내 문구는 10/17 뺌: 목록 스탬프가 퀴즈 표시라 헷갈림). 내 참여 상태는 P-1 요약 3종(기본 · 이미 참여) 분기용(10/11) | 있음 |
| poster | /api/poster/response | POST | poster_id, reason(아래 선택지), shown_order | { saved, count, goal: 2, done } 최근 15분 스캔 필요, 재응답은 덮어씀, 어떤 답이든 제출하면 그 포스터 스탬프(미션 ①). **배포 순서: DB 에 0011 · 0012 적용과 be/ 머지를 같이 → compute/ 머지** | 있음 |
| poster | /api/poster/answer | POST | quiz_id, choice_index | { correct: bool, quiz_stamps, quiz_goal: 3, stamp_count(= quiz_stamps, 예전 화면용), ticket_issued: false } 퀴즈는 이지선다(10/5 회의). 10/11 성하 결정(피그마): 정답이면 그 포스터 퀴즈 스탬프 1개(미션 ②, 서로 다른 포스터 3개), 재시도 무제한(POSTER_MAX_ATTEMPTS 를 설정했을 때만 제한), 오답이면 정답을 알려 주지 않는다. 그 포스터를 한 번이라도 스캔했어야 한다(아니면 403 SCAN_REQUIRED) | 있음 |
| poster | /api/poster/list | GET | 없음 | { posters: [{id, code, title, presenter, tags, booth, scanned, my_reason, has_quiz, quiz_solved}], total, scanned_count, progress: {responses, poster_goal, quiz_stamps, quiz_goal} } 포스터 세션 목록(P-0, 10/11). scanned 가 false 인 포스터는 화면에서 열지 않는다. progress 는 미션 마감(closed_at) 뒤 응답 · 정답을 세지 않는다(/api/poster/missions 와 같은 규칙, scan · detail · answer 의 숫자도 같음, 10/21). 마감 뒤에도 응답은 저장된다(추천 계산용) | 있음 |
| poster | /api/poster/detail | GET | id | /api/poster/scan 과 같은 모양. 목록에서 다시 열 때(피그마 A31). 한 번도 스캔하지 않았으면 403 SCAN_REQUIRED, 스캔 기록은 남기지 않는다 | 있음 |
| poster | /api/poster/interest | POST | poster_id, choice(아래 선택지) | { saved: true } 예전 화면용. v0.2 부터는 /api/poster/response | 있음 |
| poster | /api/poster/stamps | GET | 없음 | { stamps: [...], total, tickets: [...] } | 있음 |
| poster | /api/poster/missions | GET | 없음 | { window(not_started · open · closed), closed_at, feedback_open, missions: [{key(poster · quiz · exchange · feedback), label, goal, count, done, completed_at, milestones, stamps}], done_count, total, progress, completed_all_at } 이벤트 탭 미션 현황판(v0.2 E-01 ~ E-06). 10/22 피그마 이벤트·미션: 미션 4개 · 스탬프 5칸. ① 포스터 관심도 2(스탬프 1) ② 퀴즈 3(스탬프 1) ③ 명함 교환 5명(3명 · 5명에서 스탬프 1칸씩, milestones [3, 5]) ④ 행사 후기 1(스탬프 1). done_count 는 찍힌 스탬프 수, total 은 5, completed_all_at 은 5칸이 다 찍힌 시각. 판정은 서버(lib/missions.ts). 교환은 성립한 것만 같은 상대 한 번씩, 마감(closed_at) 뒤 기록은 세지 않는다. 후기는 커피챗이 끝난 뒤(wrapup · award)에만 받으므로 마감으로 자르지 않는다(feedback_open 이 true 일 때 후기 타일만 열림, 10/22 민찬 결정). 조기 퇴장한 사람(left_at)은 그 전에도 feedback_open true(10/25 민찬 결정). 진행도 = 찍힌 스탬프 수 / 5(10/22 민찬 결정, 예전 네 미션 달성률 평균은 버림). 예전 추천 인물 · 새로운 연결 · 세대 연결 미션은 없앴다(추천 인물과의 교환 수는 시상 순위 값으로만 센다, 10/23 민찬 결정) | 있음 |
| event | /api/event/feedback | GET | 없음 | { feedback: {rating, tags, comment} 또는 null } 내가 남긴 행사 후기(10/22) | 있음 |
| event | /api/event/feedback | POST | rating(1 별로였다 · 2 좋았다 · 3 최고였다), tags?(card_exchange · recommended · mission_stamp · qr_scan · layout · speed · notification), comment?(100자) | { saved: true } 행사 후기 제출(미션 ④). 커피챗이 끝난 뒤(wrapup · award)에만 받고 그 전은 409 FEEDBACK_NOT_OPEN(10/22 민찬 결정). 조기 퇴장한 사람(checkins.left_at, 0019)은 그 전에도 받지만 스탬프는 없음(마감 시각 뒤에 낸 후기만 스탬프, 10/25 민찬 결정), 0019 가 없으면 나가지 않은 것으로 봄. 재입장해도 후기는 지우지 않음(10/25 민찬 결정). 한 사람당 한 건(participant_id 로 upsert), 다시 내면 덮어쓰고 처음 낸 시각은 그대로, 스탬프 1칸. 동의 거부자는 받지 않고 403 CONSENT_REFUSED, 아직 고르지 않았으면 403 CONSENT_REQUIRED(10/23 민찬 결정). **배포 순서: DB 에 0018 적용과 be/ 머지를 같이 → fe/ 머지** | 있음 |
| ops | /api/ops/reset-pin | POST | participant_id | { pin } 새 무작위 4자리를 한 번만 돌려준다 | 있음 |
| ops | /api/ops/add-participant | POST | display_name, affiliation?, role, cohort?, is_host?, pin?, offer_text?, seek_text?, topic_tags?, assign_seat?(기본 true) | { participant, pin, seat: {version, table_no, seat_no} 또는 null, coffee_seat: {version, table_no, seat_no, fallback} 또는 null } 워크인 추가. 공개된 테이블토크가 있으면 고정 테이블을 뺀 가장 적은 테이블의 끝 좌석에 바로 넣는다(v0.2 A-05). 공개된 커피챗이 있으면 커피챗 자리도 준다(coffee_seat, 10/25. assign_seat 를 따름) | 있음 |
| ops | /api/ops/compute | GET | 없음 | { reachable, model_loaded?, version? } 계산 서비스 상태. 운영자만 | 있음 |
| ops | /api/ops/compute | POST | job: precompute(전날) · checkin(체크인 마감) · coffeechat(포스터세션 중) · final(시상 · 폐회 뒤 행사 직후 추천, 계산 서비스 /coffeechat {final:true}) | { job, ms, result } result 는 계산 서비스 응답(초안 version 등. checkin 은 새 초안이 없어 version 이 null. final 은 late = 커피챗 뒤에 들어와 자리 없이 추천만 받은 사람 수). 거절이면 409 COMPUTE_REFUSED. final 을 모르는 예전 계산 서비스면 409 COMPUTE_OLD. 운영자만 | 있음 |
| ops | /api/ops/participants | GET | 없음 | { participants: [{id, display_name, affiliation, role, cohort, is_host, is_admin, consented, consent_refused, has_sid, checked_at, is_late, left_at, left_self, coffee_late}] } 이 행사 전원. left_at 은 일찍 나간다고 표시한 시각(0019), left_self 는 본인이 눌렀으면 true · 운영자가 표시했으면 false(10/25). coffee_late 는 커피챗 공개 뒤 늦게 와서 공개된 커피챗에 자리를 받은 사람의 {table_no, seat_no, fallback}, 아니면 null(10/25, 콘솔이 의자 추가 표시). 운영자만 | 있음 |
| ops | /api/ops/checkin/leave | POST | participant_id, undo? | { left_at, already } 운영자의 나감 표시 · 되돌리기(10/25 민찬 결정). 표시하면 left_by = 운영자. 단계와 상관없이 받는다(구현하며 정함). 체크인 안 한 사람은 409 NOT_CHECKED_IN, DB 에 0019 가 없으면 503 LEAVE_UNAVAILABLE. event_log ops_checkin_leave · ops_checkin_leave_undo. 운영자만 | 있음 |
| ops | /api/ops/checkin | POST | participant_id, is_late? | { checked_at, is_late, already, coffee_seat } 수동 체크인. 이미 돼 있으면 already true. 커피챗 배정이 공개된 뒤 처음 체크인하면 커피챗 자리 coffee_seat {version, table_no, seat_no, fallback}(10/25), 아니면 null. 운영자만 | 있음 |
| ops | /api/ops/labels | GET | 없음 | { codebook_version, labels: [{prefix, label, members}] } 활성 코드북의 이름표. 운영자만 | 있음 |
| ops | /api/ops/labels | POST | codebook_version, prefix, label | { saved: true } 이름표 한 줄 수정. 활성 코드북이 아니면 409 NOT_ACTIVE. 운영자만 | 있음 |
| ops | /api/ops/poster | GET | 없음 | { posters: [{id, code, title, presenter, booth, stamps, interest: {want?, maybe?, not_mine?}}], stamps_total, people_with_stamps, tickets_total, people_with_tickets, raffle } 포스터세션 현황. interest 는 관심 포스터 응답(poster_responses.reason) 포스터별 수, 응답이 없는 단계는 키가 없다. 운영자만 | 있음 |
| ops | /api/ops/raffle | POST | n | { at, n, winners: [{id, display_name, affiliation, tickets}] } 응모권 1장 1표, 한 사람 한 번. 응모권 없으면 409 NO_TICKETS. 운영자만 | 있음 |
| ops | /api/ops/unpublish | POST | version | { retired, round } 공개 철회(비상용). 공개 중이 아니면 409 NOT_PUBLISHED. 운영자만 | 있음 |
| ops | /api/ops/publish | POST | version | { published_at, round, retired: [version] } 초안을 공개하고 같은 행사 · 라운드의 이전 공개 버전은 retired 로. 이미 공개 409 ALREADY_PUBLISHED, 철회본 409 RETIRED. 운영자만 | 있음 |
| ops | /api/ops/versions | GET | 없음 | { versions: [{version, round, status, created_at, published_at, summary}] } 이 행사 최신 20개. 운영자만 | 있음 |
| ops | /api/ops/versions/<version> | GET | 없음 | { version, round, status, metrics: {groups, sizes, size_min, size_max, mean_score, low_score, check_tables, reunion_pairs(커피챗만, 아니면 null), cohort_over, not_checked_in, left(계산 뒤 나감: 구성원 중 지금 나감 표시), left_excluded(계산에서 뺌: params.left, 없으면 null)}, tables: [{table_no, mean_score, check, members: [{id, display_name, affiliation, role, cohort, seat_no, random, lead, late_join, left, reason}]}] } 배정 확인용(v0.2 A-03). 점수는 그 버전 pair_scores 의 테이블 안 쌍 평균. check 는 평균보다 1 표준편차 넘게 낮은 테이블(없으면 가장 낮은 하나). 기수 초과 상한은 계산 서비스와 같다(테이블토크 3, 커피챗 3. 10/22 전 3~4명 그룹은 2). members.lead 는 커피챗 주도 선배(10/22, 콘솔에 '주도' 표시). members.late_join 은 커피챗 공개 뒤 늦게 와서 앉은 사람(10/25, 콘솔에 '늦게 옴 · 의자 추가' 표시, 재회 쌍에서 뺌). members.left · metrics.left 는 일찍 나간다고 표시한 사람(10/25, 콘솔에 나감 · 빈자리 표시). 운영자만 | 있음 |
| ops | /api/ops/swap | POST | version, a, b(participant id) | { version(새 초안), source_version, round, delta, before, after } 수동 교체(v0.2 A-04). 원본은 두고 복사본 초안을 만들어 두 사람의 테이블 · 좌석을 맞바꾼다. 두 사람의 reason 은 기존 키(주도 선배 lead 등)를 남기고 text(운영자 수동 교체) · table_no · seat_no 만 바꾼다. delta 는 두 사람이 낀 테이블 안 쌍 점수 합의 변화. 같은 테이블 409 SAME_TABLE, 철회본 409 RETIRED. 공개는 /api/ops/publish. 운영자만 | 있음 |
| ops | /api/ops/phase | POST | phase(아래 단계 값), reopen_missions? | { phase, phase_label, at, mission_closed_at } 단계 전환(v0.2 A-02). 처음 wrapup · award 로 넘어갈 때 미션 마감 시각을 고정한다(reopen_missions true 면 마감을 지운다). 운영자만 | 있음 |
| ops | /api/ops/notice | POST | preset?(start · move · last5) 또는 text?(80자), minutes?(기본 5), clear? | { notice: {text, preset, expires_at} 또는 null } 공지 송출(v0.2 A-06). 만료까지 /api/state 의 notice 로 나간다. clear true 면 내린다. 운영자만 | 있음 |
| ops | /api/ops/audit | GET | limit?(기본 50) | { entries: [{id, kind, actor: {id, display_name}, payload, at}] } 감사 로그(v0.2 A-09). 단계 전환 · 공지 · 공개 · 철회 · 수동 교체 · 계산 · 체크인 · 이름표 · 추첨 · 시상 제외 · 워크인 · 숫자 재발급. 운영자만 | 있음 |
| ops | /api/ops/missions | GET | 없음 | { window, closed_at, checked_in, stamp_total(5), avg_stamps, avg_progress, completed_all(스탬프 5칸 모두), by_mission: [{key, label, done}], excluded, candidates: [{place, tied(공동 순위), id, display_name, affiliation, progress, done_count(스탬프 수), recommended_exchanges(추천 인물과의 교환 수, 최대 5), valid_poster_responses}], qr: {card_scans, poster_scans, tab_mismatch} } 이벤트 · 미션 · 시상 현황(v0.2 A-07, 결정 12). 미션 4종 · 스탬프 5칸. 후보는 제외 명단을 뺀 스탬프 1칸 이상인 사람의 5위까지(시상 5명, 10/25 민찬 결정. 5위가 공동이면 모두). 순위는 스탬프 수 → 추천 인물과의 교환 수(교환 성립 전에 내 오늘 만나면 좋을 분 목록 rec_impressions 에 떴던 상대, 성립 · 마감 전 · 서로 다른 사람, 5명까지) → 유효 포스터 응답 수(5초 이상) 많은 순이고, 셋이 같으면 공동 순위(place 같음, tied true)다. 시각 기준은 쓰지 않는다(10/23 민찬 결정, lib/award.ts). 공동 순위 안의 줄 순서는 이름 순 → id 순(구현하며 정함). 이용 동의(수집) 거부자는 후보에서 뺀다(명함 공개만 거부한 사람은 남김). 운영진용 설명은 docs/RUNBOOK_EVENT_DAY.md '마무리 · 시상'. 탭 불일치 = 명함 QR 을 이벤트 탭에서 · 포스터 QR 을 명함 탭에서 읽은 수. 운영자만 | 있음 |
| ops | /api/ops/award-exclude | GET | 없음 | { people: [{id, display_name, affiliation}], at } 특별 시상 제외 명단(v0.2 E-06). 운영자만 | 있음 |
| ops | /api/ops/award-exclude | POST | csv?(한 줄에 이름,소속), ids? | { people, unmatched: [줄], at } 명단을 통째로 바꾼다. 이름이 없거나 동명이인을 못 가리면 unmatched. 운영자만 | 있음 |
| ops | /api/ops/print | GET | round?(tabletalk 기본 · coffeechat), version? | 인쇄용 HTML(JSON 아님). 테이블별 좌석 순 명단(v0.2 A-10). 브라우저 인쇄로 PDF 저장. version 없으면 그 라운드 공개 버전. 운영자만 | 있음 |
| ops | /api/ops/status | GET | 없음 | { event_id, phase, phase_label, phase_at, participants, checkins, left(체크인한 사람 중 일찍 나간다고 표시한 수, 0019), satisfaction: {answered, rate}, satisfaction_by_round: {tabletalk, coffeechat: {answered, rate}}, skew: {gini, zero_received}, exchanges, compute_heartbeat: {at, last} 또는 null, published: {tabletalk, coffeechat: {version, published_at} 또는 null}, now } 상태판. 교환은 성립한 것만. skew 는 체크인한 사람이 받은 교환 수의 지니 계수(0 고르게, 1 한 사람에게 몰림)와 한 건도 못 받은 사람 수(v0.2 A-01). 무응답률 = 1 - rate. 운영자만 | 있음 |

card 객체는 모든 card 응답에서 같은 모양이다: `{ id, display_name, affiliation, role, cohort, stage(1 명단만·2 프로필·3 주소), sid, label, theme(0~7 또는 null), offer_text, seek_text, topic_tags, links 또는 null, source?, exchanged_at?, status?, first_meet?, note?, met?, together? }`(물음표는 명함함 · 알림에서만). 링크는 상대의 visibility 가 all 이거나 내가 그 사람을 직접 찍었을 때만 들어간다.

## 동의 거부자 (v0.2 H-00, 10/5 회의)

10/11(0014) 동의는 두 항목이다. 개인정보 수집 및 이용(collect)을 거부하면 아래의 행사 중 수집을 막고, 명함 공개 및 추천 활용(share)을 거부하면 남의 추천 · 이름 검색 · 궤도에서 빠지고 명함 교환을 주고받지 않는다(SHARE_REFUSED · TARGET_UNAVAILABLE). 온보딩의 동의 · 거부는 두 항목을 같이 정한다.

동의를 거부한 사람도 사전 등록 정보로 배정(테이블토크 · 커피챗)에는 들어간다. 행사 중 수집 쓰기(/api/card/scan · confirm · first-meet · recs, /api/poster/scan · response · answer · interest, /api/tabletalk/satisfaction POST, /api/event/feedback POST, 검색 시제품)는 403 CONSENT_REFUSED(아직 고르지 않았으면 CONSENT_REQUIRED)를 돌려준다. 남의 추천 · 이름 검색 · 궤도에서도 빠진다. 판정은 `lib/consent.ts`.

## 행사 단계 (v0.2 A-02, `lib/phase.ts`)

| 값 | 식순 | 추천 목록 | 미션 |
|---|---|---|---|
| before | 행사 전 | 열림 | 곧 시작 |
| checkin | 등록 · 개회 | 열림 | 곧 시작 |
| tabletalk | 서비스 소개 · 테이블토크 | 접힘 | 진행 |
| tabletalk_end | 테이블토크 마무리(만족도) | 접힘 | 진행 |
| poster | 포스터 세션 | 열림 | 진행 |
| coffeechat_seated | 커피챗(이동 없음, 10/21 민찬 결정으로 자유 이동 단계 coffeechat_free 를 뺌) | 접힘 | 진행 |
| wrapup | 마무리(커피챗 만족도) | 열림 | 마감, 읽기 전용(행사 후기만 열림) |
| award | 시상 · 추첨 | 열림 | 마감, 읽기 전용(행사 후기만 열림) |

## 선택지 (만족도, 관심도)

숫자 점수 대신 문장을 고르게 한다. 요청에는 키를 보내고 화면에는 문구를 보여 준다. 목록의 정본은 코드다(tabletalk `app/api/tabletalk/_choices.ts`, poster `app/api/poster/_lib.ts`). 화면은 이 목록을 import 해서 순서대로 그린다.

| 경로 | 키 | 화면 문구 |
|---|---|---|
| /api/tabletalk/satisfaction(10/9 따봉 3단계, 키는 그대로 문구만 바꿈) | gained | 👍👍 최고였어요 |
| | different | 👍 좋았어요 |
| | mismatch | 👎 별로였어요 |
| /api/poster/response(0011 부터) | want | 꼭 만나 보고 싶어요 |
| | maybe | 기회가 되면 좋아요 |
| | not_mine | 제 관심 분야는 아니에요 |
| /api/poster/interest(예전 화면) | learn_more | 더 알아보고 싶다 |
| | interesting | 흥미로웠다 |
| | not_mine | 내 관심 분야는 아니다 |

## 늦게 온 사람의 커피챗 자리 (10/25 민찬 결정)

커피챗 계산은 그때 체크인한 사람만 앉힌다. 커피챗 배정이 공개된 뒤에 처음 체크인한 사람은 아래 때에 공개된 커피챗 버전에 자리를 바로 받는다(apps/web/lib/coffeechatLate.ts).

| 때 | 어디서 |
|---|---|
| 첫 로그인 | /api/onboarding/login (ensureCheckin, 체크인이 이번에 새로 생겼을 때만) |
| 운영자 수동 체크인 | /api/ops/checkin (처음 체크인할 때만) |
| 워크인 추가 | /api/ops/add-participant (assign_seat 기본 true) |
| 커피챗 계산 뒤 · 공개 전에 들어와 자리가 없는 사람 | /api/state 다음 폴링(구현하며 정함 · 10/25 민찬 확정. 이미 앉은 사람은 추가 쿼리 없음) |

- 자리 고르기: 계산 서비스 POST /coffeechat/late 에 묻는다(같은 COMPUTE_URL · X-Compute-Secret, 2.5초 제한). 행사 전 정보만으로 테이블 구성원과의 점수 평균이 가장 높은 테이블. 인원이 (가장 적은 테이블 + 1) 이하인 테이블만, 같은 기수 상한(3)을 넘지 않는 테이블 우선. 테이블토크 동석자 금지는 걸지 않는다(테이블토크에 없었다)
- 계산 서비스가 답이 없거나 느리거나 409 · 오류면 인원이 가장 적은 테이블(같으면 번호가 작은 쪽). reason.text 는 늦게 와서 배정(계산 서비스 응답 없음 · 인원이 가장 적은 테이블), reason.fallback true
- 좌석 = 그 테이블의 (가장 큰 좌석 번호, 인원) 중 큰 쪽 + 1. 계산 서비스 응답(또는 시간 초과) 뒤에 자리를 다시 읽어 센다. 앉아 있는 사람 번호는 그대로. 동시에 여럿이 같은 번호를 받으면 한 명(원래 배정된 사람 → id 가 가장 작은 사람)만 남기고 나머지를 차례로 다음 번호로 옮긴 뒤, 내 좌석 번호를 다시 읽어 돌려준다
- table_members.reason: text(예: 늦게 와서 배정 · 잘 맞는 사람 OO), late_join true, table_no, seat_no, best_mate · best_score · avg_score(계산 서비스가 고른 경우). 주도 선배(lead)로 두지 않는다
- (version, participant_id) 기본 키로 두 번 들어가지 않는다(upsert ignoreDuplicates). event_log 에 coffeechat_late_seat {version, table_no, seat_no, fallback, compute_status, ms, by}, 실패하면 coffeechat_late_seat_fail
- 건너뜀: 공개된 커피챗이 없을 때, 행사 직후 추천(params.kind final)이 공개됐을 때, 단계가 마무리 · 시상(wrapup · award)일 때. 커피챗이 끝나 자리가 쓸모없고, final 은 원본 그룹을 그대로 쓰는 추천 전용 버전이기 때문이다(구현하며 정함)
- 본인이 일찍 나간다고 표시했으면(checkins.left_at) 건너뛴다. 계산 서비스를 기다린 뒤에도 한 번 더 본다. 테이블 인원을 셀 때 나간 사람은 빼지만(빈자리) 좌석 번호는 나간 사람 번호까지 센 다음 번호다(10/25, 구현하며 정함)
- 어떤 오류도 로그인 · 체크인을 막지 않는다. 참가자 화면은 current_tables 를 읽으므로 바로 n번 테이블 m번 자리가 보인다. 늦게 온 사람은 커피챗 추천 목록 · 그룹 근거 한 줄이 없다(그 버전 계산 때 없었다)
- 행사 직후 추천(final)은 원본 커피챗 자리를 그대로 읽으므로 늦게 와서 앉은 사람도 같은 테이블 · 좌석으로 남는다

## 일찍 나가는 사람 (10/25 민찬 결정)

checkins.left_at(0019)이 있으면 일찍 나간 사람이다. 본인이 마이 탭의 조기 퇴장(/api/checkin/leave)를 누르거나 운영자가 체크인 칸에서 나감 표시(/api/ops/checkin/leave)를 한다. 되돌리면 left_at 이 비고 행사장에 있는 사람으로 돌아간다.

| 어디 | 나감 표시한 사람 |
|---|---|
| 커피챗 계산(/coffeechat) | 앉히지 않고 주도 선배 후보도 아니다. 그 버전 추천 목록 · 그룹 근거에도 없고 남의 커피챗 추천에도 나오지 않는다. params.left · 응답 left 에 뺀 수 |
| 늦게 온 사람 자리(lib/coffeechatLate.ts, /coffeechat/late) | 자리를 주지 않는다(계산 서비스는 409). 테이블 인원에서 빠진다 |
| 커피챗 공개 뒤에 나감 | 공개된 자리는 그대로 둔다(빈자리). 다시 계산하지 않는다 |
| 커피챗 계산 전에 나갔다가 되돌림 | 공개 뒤 /api/state 다음 폴링에서 늦게 온 사람처럼 자리를 받는다 |
| 행사 후기(/api/event/feedback, 미션 ④) | 커피챗이 끝나기 전에도 받는다(스탬프 1칸). 마이 탭 재입장 아래 행사 후기 남기기 한 줄(이미 냈으면 숨김). 재입장해도 낸 후기는 그대로 둔다 |
| 행사 직후 추천(/coffeechat final) | 빼지 않는다(구현하며 정함). 원본에 자리가 있으면 그대로, 없으면 자리 없이 추천만(응답 late 에 셈). 행사 뒤 연락할 사람 추천은 일찍 간 사람에게도 쓸모가 있다 |

- 본인 버튼은 등록 · 개회부터 커피챗까지(lib/phase.ts LEAVE_OPEN)만 보이고 받는다. 마무리 뒤에는 숨긴다. 운영자는 단계와 상관없이 고친다
- 말없이 나간 사람은 알 수 없다. 표시한 사람만 뺀다
- 0019 가 DB 에 아직 없으면(칸이 없다는 오류 42703 · PGRST204) 읽는 곳 전부(/api/state, 콘솔 체크인 · 상태판 · 배정 보기, 늦게 온 사람 자리)가 아무도 나가지 않은 것으로 보고 계속 돈다(lib/checkinLeft.ts, 계산 서비스 repo.left_checkins 와 같음). 나감 표시 API 두 개만 503 LEAVE_UNAVAILABLE

## 계산 서비스 (services/compute, 내부 HTTP)

| 경로 | 방법 | 언제 | 하는 일 |
|---|---|---|---|
| /health | GET | 항상 | 모델·코드북 로드 여부 |
| /precompute | POST | 행사 전날 | 사전 등록자 전원 임베딩·코드북·주소·라벨 발급, 테이블토크 배정 · 좌석 draft(1번 고정 + 2~10번, 10/21 민찬 결정), 전날 추천 목록. reuse_codebook=true 면 현장 등록자 주소만 |
| /search | POST | 쓰지 않음(10/10 전체 회의에서 참석자 검색 제외, 웹 API 삭제) | q(2~30자), viewer_id, aliases?(웹 줄임말 사전의 같은 뜻 다른 표기, 최대 20) → { q, people: [{id, score}], all_scores } 하는 일 문장 · 관심 태그 중 검색어와 가장 가까운 것의 cos 를 그 사람 점수로(문장별 최고), 평균 + 1 표준편차 이상 최대 10. aliases 는 검색어 뒤 괄호로 붙여 벡터로 바꿈. score 는 웹 정렬 · 거르기용, 화면에 안 냄. WARM_MODEL=1 이면 켤 때 모델을 미리 올림 |
| /coffeechat | POST | 포스터 응답 마감 뒤(16:45) | 체크인 명단 + 명함 교환 + 테이블토크 만족도 + 포스터 응답(docs/DATA_SPEC.md 규칙) 으로 점수 재계산, 체크인 전원 10테이블 draft(1번 고정 없음, 테이블마다 주도 선배 2명 = reason.lead, 응답 leads. 10/22 민찬 결정), 테이블마다 좌석 순서(table_members.seat_no, 주도 선배 둘은 마주 보게 = COFFEE_LEAD_SEATING facing, 10/23 운영진 확정), 지연 체크인(checkins.is_late)한 사람은 주도 선배로 뽑지 않음(구현하며 정함), 일찍 나간다고 표시한 사람(checkins.left_at)은 배정 · 주도 선배 · 추천에서 뺌(응답 left, 10/25 민찬 결정), 그룹 카드 근거 한 줄, 커피챗 버전 추천 목록(커피챗 중 이동 없음, 10/21) |
| /coffeechat/late | POST | 커피챗 공개 뒤 늦게 온 사람 체크인 때(웹이 부름) | {event_id, participant_id, version?} → {version, already, table_no, seat_no, reason, tables: [{table_no, size, same_cohort, mean}]}. 고르기만 하고 쓰지 않는다(쓰기는 웹). 위 늦게 온 사람의 커피챗 자리 규칙. 저장된 벡터가 없으면 모델이 이미 올라와 있을 때만 프로필을 임베딩하고, 아니면 또는 프로필이 비었으면 409 → 웹 대체 경로(10/25). 본인이 일찍 나간다고 표시했으면 409(웹은 부르기 전에 걸러 앉히지 않는다), 나간 구성원은 테이블 인원 · 점수 평균에서 뺀다 |
| /coffeechat { final: true } | POST | 행사 직후(시상 · 폐회 뒤) | 행사 직후 추천(10/6). 한 번이라도 공개된 커피챗 버전(final 제외, retired 포함)의 그룹을 그대로 두고 커피챗 계산과 같은 신호(검색은 감쇠 없이 그날 것 전부)로 추천 목록만 다시 만든다. 테이블토크 · 커피챗 동석자와 이미 교환한 사람은 빠진다(오늘 못 만났지만 연락해 볼 만한 사람). 커피챗 뒤에 들어온 사람은 자리 없이 추천만 받는다(응답 late). 일찍 나간다고 표시한 사람도 빼지 않는다(10/25, 구현하며 정함). 새 draft(round=coffeechat, params.kind=final, source_version)로 저장하고 운영자가 공개하면 원래 커피챗 버전은 retired 가 되고 H-04 추천(/api/card/recs)이 이 목록을 쓴다. 공개된 커피챗 배정이 없으면 409 |

호출자는 헤더 `X-Compute-Secret` 을 보낸다. 결과는 계산 서비스가 DB 에 직접 쓰고 `assign_versions.version` 만 돌려준다.
