# 온보딩·홈 구현 계획 (성하, 2026-09-25)

피그마 화면플로우의 온보딩(QR 입장 → 이름 로그인 → 개인정보 동의 → 로딩 → 테이블 번호 안내)과 홈탭(궤도 시각화, 내 간단 소개, 하단 메뉴, 사용설명서, 챗봇 진입)을 구현한다. 계산 서비스가 아직 없으므로 시드 데이터로 주소와 테이블토크 배정을 미리 넣고 시작한다.

## 0. 흐름 (확정, 9/25 수정)

1. 행사 전: 사전 등록 데이터로 개인 DB(participants, profiles)를 만든다. 이때 로그인 숫자 4자리를 같이 정해 해시로 넣는다. 기본은 사전 등록에 적은 휴대폰 번호 뒤 4자리이고, 번호가 없으면 무작위 4자리를 만들어 개별 안내한다. 휴대폰 번호 자체는 저장하지 않는다. 회원가입은 이 적재로 자동 완료된다.
2. 행사 전: 계산 서비스가 주소(SID)와 테이블토크 배정을 발급해 둔다.
3. 입장: 입구의 공용 QR(앱 주소 하나)을 찍으면 이름과 숫자 4자리 입력 칸이 바로 뜬다. 입력하면 즉시 로그인되고 체크인으로 기록된다. 재접속도 같은 화면이다.
4. 첫 로그인 직후 한 번: 개인정보 동의 → 테이블 번호 안내.
5. 홈: 테이블 배정, 내 주소(SID)와 라벨, 지금 입장한 사람들로 그리는 내 궤도, 내 간단 소개, 하단 메뉴.

## 0-1. 먼저 정할 것 (구현 전 결정)

| 항목 | 결정안 | 이유 |
|---|---|---|
| 로그인 화면 | 이름 칸과 숫자 4자리 칸 하나씩. 검색·선택 단계 없음 | 참가자가 이미 아는 두 값만 입력한다 |
| 동명이인 | 서버가 같은 이름 전원을 찾아 숫자를 비교한다. 한 명만 맞으면 로그인, 둘 이상 맞으면 소속을 고르는 화면 하나 추가, 아무도 안 맞으면 실패 | 동명이인이면서 뒤 4자리까지 같은 경우만 한 단계 더 간다 |
| 숫자 4자리 | 휴대폰 번호 뒤 4자리. 없으면 무작위. bcrypt 해시만 저장하고 원문·전화번호는 저장하지 않는다 | 참가자가 외울 필요가 없다. 유출돼도 전화번호는 복원되지 않는다 |
| 시도 제한 | 같은 이름에 10분 안 5회 실패면 10분 잠금. IP 기준 분당 20회 | 4자리는 경우의 수가 1만 개라 온라인 제한이 필수다 |
| 잊었을 때 | 운영 콘솔에서 새 무작위 4자리를 발급해 구두로 알려 준다 | 사전 등록 번호를 바꾼 사람 대비 |
| 워크인(사전 등록 없음) | 운영 콘솔에서 이름·소속·숫자를 넣어 추가한다. 주소는 임시(is_temp) | 현장 등록 화면은 만들지 않는다 |
| 체크인 | 첫 로그인이 곧 체크인이다. checkins 에 자동 기록 | 별도 체크인 절차를 없앤다 |
| 세션 | httpOnly 쿠키 24시간, 서명 JWT(lib/session.ts) | 이미 구현됨 |
| 동의 | 첫 로그인 직후 한 번. consent_at 기록, 이후 건너뜀 | 개인정보 보호법 15조 고지 4개(목적, 항목, 보유기간 30일, 거부권) |
| 배정 전 상태 | 테이블 배정이 published 가 아니면 배정 전 화면. 10초마다 다시 조회 | current_tables 유무로 판단 |
| 궤도에 그리는 사람 | 체크인된 사람만. 15초마다 다시 조회해 새로 입장한 사람이 링에 추가된다 | 실시간 궤도의 뜻을 이렇게 정한다 |
| 궤도 링 기준 | 링1 = 주소 앞 3자리 일치, 링2 = 앞 2자리, 링3 = 앞 1자리, 그 밖은 표시하지 않음. 링당 최대 12명, 나머지는 +N | 6번 방법론 궤도 뷰 |
| 궤도에 보이는 정보 | 이름과 소속만. 탭하면 태그와 한 줄 소개 | 연락처·링크는 명함 모듈에서 공개 범위대로 |
| 궤도 그리기 | D3 없이 SVG 원 위에 각도 균등 배치. 새 사람은 링 끝에 추가 | 150명 이하에 물리 시뮬레이션은 과하다 |
| 홈의 내 분야 표시 | 주소 숫자는 보여 주지 않고 첫자리 묶음 이름표(예: 추천시스템, 커머스 계열)만 카드로(9/27 회의). 명함과 같은 위치·글꼴 | 숫자는 사람마다 기준이 없어 의미가 약하다 |
| 하단 메뉴 | 테이블토크, 명함, 스탬프(포스터), 커피챗, 챗봇. 챗봇은 P2 라 비활성 표시 | 피그마 메뉴 순서 |
| 사용설명서 | 정적 페이지 `/home/guide` | 텍스트는 나혜·현희에게 받고 자리만 만든다 |

## 1. 시드 확장과 적재 스크립트

`supabase/seed_dev_assign.sql` 을 새로 만든다. 개발용에만 넣는다.

- sids: 가짜 10명에게 offer_sid, seek_sid 를 손으로 넣는다. 예: 추천시스템 계열 3명은 {2,1,x}, 금융 2명은 {5,3,x}. 벡터는 384차원 0 배열이어도 된다.
- labels: {2} 추천·커머스 계열, {5} 금융·시계열 계열, {2,1} 추천시스템 처럼 6개.
- assign_versions 1건(round tabletalk, status published), tables_meta 2개(라벨과 대화거리), table_members 10명을 5명씩.
- 동명이인 시험용으로 이름이 같은 두 명(소속 다름, 숫자 다름)을 추가한다. 기존 10명의 숫자는 0000.
- SETUP_SUPABASE.md 에 실행 순서 한 줄 추가.

적재 스크립트 `scripts/import_participants.py` 를 만든다(행사 전 실제 사용). 사전 등록 CSV(이름, 소속, 구분, 기수, 휴대폰, 하는 일, 찾는 사람, 태그)를 읽어 participants·profiles 에 넣고, 숫자 4자리는 휴대폰 뒤 4자리를 bcrypt 로 해시해 넣는다. 휴대폰 열은 메모리에서만 쓰고 DB 와 로그에 남기지 않는다. 휴대폰이 비면 무작위 4자리를 만들어 별도 파일(저장소 밖)에 이름과 함께 적어 운영진이 안내한다.

## 2. API (apps/web/app/api/onboarding, api/home)

| 경로 | 방법 | 입력 | 처리 | 응답 data |
|---|---|---|---|---|
| /api/onboarding/login | POST | display_name, pin, participant_id? | 이름으로 후보 전원 조회 → 숫자 비교. 1명 일치면 setSession + checkins 기록. 2명 이상 일치면 후보 목록 반환(소속·구분·기수), participant_id 를 받아 재시도. 실패는 잠금 카운트 | { participant: {id, display_name, role, is_admin}, consented } 또는 { choose: [{id, display_name, affiliation, role, cohort}] } |
| /api/onboarding/logout | POST | 없음 | clearSession | { ok } |
| /api/onboarding/consent | POST | agreed: true | consent_at 기록 | { consent_at } |
| /api/onboarding/me | GET | 세션 | participants + profiles + sids(주소·라벨) + current_tables(tabletalk) | { participant, profile, consented, sid: {offer_sid, label} 또는 null, table: {table_no, label} 또는 null } |
| /api/home/orbit | GET | 세션 | 체크인된 사람의 offer_sid 를 내 것과 비교, 링별 그룹, labels 붙임 | { me: {prefix, label}, rings: [{match_len: 3, people: [{id, display_name, affiliation, topic_tags}]}, ...], hidden_count, checked_in_total } |
| /api/home/intro | GET | 세션 | profiles 의 offer_text, seek_text, topic_tags | { intro } |
| /api/ops/reset-pin | POST | participant_id | requireAdmin. 새 무작위 4자리를 해시로 저장하고 원문을 응답에 한 번만 돌려준다 | { pin: "1234" } |
| /api/ops/add-participant | POST | display_name, affiliation, role, cohort, pin | requireAdmin. 워크인 추가 | { participant } |

모든 응답은 lib/api.ts 의 ok/fail. 세션은 lib/session.ts 의 requireSession. 쓰기는 lib/log.ts 로 event_log 에 남긴다(login_ok, login_fail, login_locked, consent, open_home, open_orbit).

## 3. 화면 (apps/web/app/(modules)/onboarding, home)

| 경로 | 화면 | 상태 |
|---|---|---|
| /onboarding | 이름 칸, 숫자 4자리 칸, 입장 버튼. 공용 QR 은 이 주소를 가리킨다 | 실패 안내(이름 또는 숫자가 다르다), 잠금 안내, 동명이인이면 소속 선택 목록이 아래에 펼쳐진다 |
| /onboarding/consent | 동의 화면. 고지 4개와 체크 1개, 동의 버튼. 처리방침 링크 | 이미 동의했으면 건너뜀 |
| /onboarding/table | 로딩(테이블 정보 확인 중) → 테이블 번호와 라벨 → 홈으로 버튼 | 배정 전이면 대기 화면과 10초 재조회 |
| /home | 상단(사용설명서, 챗봇 아이콘), 내 분야 카드(이름표·테이블 번호, 주소 숫자는 숨김), 궤도 SVG(15초 갱신), 내 간단 소개, 하단 메뉴 | 궤도 인원 탭 시 작은 카드 |
| /home/guide | 사용설명서 정적 페이지 | 텍스트 자리 |

공용 컴포넌트(components/): BottomNav, TopBar, PersonChip(이름·소속 칩), Loading, SidBadge(분야 이름표, 주소 숫자는 숨김). 명함 모듈도 SidBadge 를 쓴다.

라우트 보호: `app/(modules)/home/layout.tsx` 에서 getSession 이 없으면 /onboarding 으로, consented 가 아니면 /onboarding/consent 로 보낸다. 다른 모듈 담당도 같은 layout 패턴을 복사해 쓴다. 미들웨어는 두지 않는다.

## 4. 작업 순서 (에이전트에게 하나씩)

| 순서 | 작업 | 완료 기준 |
|---|---|---|
| 1 | 시드 확장 SQL(주소·라벨·배정·동명이인 2명), dev DB 적용 | current_tables 뷰에 12행 |
| 2 | 공용 컴포넌트 BottomNav, TopBar, PersonChip, Loading, SidBadge | 홈 빈 화면에 붙어서 보인다 |
| 3 | API login, logout, consent, me, ops/reset-pin, ops/add-participant | 학생 A + 0000 로그인 성공, 틀린 숫자 5회 후 423, 동명이인 두 명은 choose 응답 뒤 participant_id 로 성공 |
| 4 | 화면 /onboarding | 시드 참가자로 로그인되고 쿠키가 생긴다. 동명이인 선택이 펼쳐진다 |
| 5 | 화면 /onboarding/consent, /onboarding/table, home layout 보호 | 동의 전엔 홈 진입 불가, 동의 후 테이블 번호가 보인다 |
| 6 | API orbit, intro | 시드 기준 링1·2·3 에 사람이 나뉘고, 체크인 안 된 사람은 빠진다 |
| 7 | 화면 /home 주소 카드, 궤도 SVG(15초 갱신), 소개 카드, /home/guide | 폰 폭(375px)에서 겹침 없음. 다른 브라우저로 학생 D 를 로그인시키면 15초 안에 궤도에 나타난다 |
| 8 | 적재 스크립트 scripts/import_participants.py | 가짜 CSV 20명이 dev DB 에 들어가고 뒤 4자리로 로그인된다. 전화번호는 어디에도 남지 않는다 |
| 9 | 마무리: 이벤트 로그, 빌드, Vercel 배포, 폰 카메라로 공용 QR 입장 확인 | 내 폰으로 배포 주소 QR 을 찍어 홈까지 간다 |

1~3은 하루, 4~5는 하루, 6~7은 하루, 8~9는 하루다. 9/28 배포 뼈대 목표에 맞는다.

## 5. 다른 모듈과 맞출 것

- BottomNav 의 링크 경로는 `/tabletalk`, `/card`, `/poster`, `/coffeechat`, `/home/chat`(비활성) 으로 고정한다. 민찬에게 알린다.
- 세션과 동의 확인 layout 패턴을 docs/MODULES.md 에 추가해 민찬 모듈도 같은 방식으로 보호한다.
- 궤도 API 의 사람 목록 형식({id, display_name, affiliation, topic_tags})은 명함·테이블토크 화면에서도 같은 칩을 쓰도록 PersonChip 에 맞춘다.

## 6. 미정이라 보류

- 사용설명서 본문과 개인정보 처리방침 1장(문구 담당 미정)
- 사전 등록 폼에 휴대폰 번호 항목이 있는지, 없다면 추가할지(없으면 전원 무작위 4자리 개별 안내)
- 궤도에서 공개 범위 scanned 인 사람의 이름을 가릴지(지금은 전원 이름 표시로 시작)
