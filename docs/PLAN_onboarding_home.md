# 온보딩·홈 구현 계획 (성하, 2026-09-25)

피그마 화면플로우의 온보딩(QR 입장 → 이름 로그인 → 개인정보 동의 → 로딩 → 테이블 번호 안내)과 홈탭(궤도 시각화, 내 간단 소개, 하단 메뉴, 사용설명서, 챗봇 진입)을 구현한다. 계산 서비스가 아직 없으므로 시드 데이터로 주소와 테이블토크 배정을 미리 넣고 시작한다.

## 0. 먼저 정할 것 (구현 전 결정)

| 항목 | 결정안 | 이유 |
|---|---|---|
| 로그인 두 경로 | 입장 QR(`/onboarding?t=토큰`)이면 이름을 건너뛰고 비밀번호만. 토큰 없이 들어오면 이름 검색 → 동명이인이면 소속으로 고름 → 비밀번호 | 회의록 14의 이름 + 간단 비밀번호. 토큰이 있어도 비밀번호는 받는다(QR 캡처 전달 대비) |
| 비밀번호 | 숫자 4자리. 사전 적재 때 운영진이 정해 개별 안내 | 현장에서 입력이 쉬워야 한다 |
| 시도 제한 | 같은 참가자에 10분 안 5회 실패면 10분 잠금 | event_log 의 login_fail 로 센다. 별도 테이블 없음 |
| 세션 | httpOnly 쿠키 24시간, 서명 JWT(lib/session.ts) | 이미 구현됨 |
| 동의 | 동의 안 한 참가자는 홈으로 못 간다. 동의하면 consent_at 기록, 이후 건너뜀 | 개인정보 보호법 15조 고지 4개(목적, 항목, 보유기간 30일, 거부권) |
| 배정 전 상태 | 테이블 배정이 published 가 아니면 배정 전 화면. 10초마다 다시 조회 | ops_state.phase 가 아니라 current_tables 유무로 판단 |
| 궤도 링 기준 | 링1 = 주소 앞 3자리 일치, 링2 = 앞 2자리, 링3 = 앞 1자리, 그 밖은 표시하지 않음 | 6번 방법론 궤도 뷰. 링당 인원이 많으면 최대 12명만 그리고 나머지는 +N |
| 궤도에 보이는 정보 | 이름과 소속만. 탭하면 태그와 한 줄 소개 | 연락처·링크는 명함 모듈에서 공개 범위대로 |
| 궤도 그리기 | D3 없이 SVG 원 위에 각도 균등 배치 | 150명 이하에 물리 시뮬레이션은 과하다. 정적이라 폰에서 가볍다 |
| 하단 메뉴 | 테이블토크, 명함, 스탬프(포스터), 커피챗, 챗봇. 챗봇은 P2 라 비활성 표시 | 피그마 메뉴 순서 |
| 사용설명서 | 정적 페이지 `/home/guide` | 텍스트는 나혜·현희에게 받고 자리만 만든다 |

## 1. 시드 확장 (계산 서비스 대신)

`supabase/seed_dev_assign.sql` 을 새로 만든다. 개발용에만 넣는다.

- sids: 가짜 10명에게 offer_sid, seek_sid 를 손으로 넣는다. 예: 추천시스템 계열 3명은 {2,1,x}, 금융 2명은 {5,3,x}. 벡터는 384차원 0 배열이어도 된다(화면은 벡터를 안 본다).
- labels: {2} 추천·커머스 계열, {5} 금융·시계열 계열, {2,1} 추천시스템 처럼 6개.
- assign_versions 1건(round tabletalk, status published), tables_meta 2개(라벨과 대화거리), table_members 10명을 5명씩.
- SETUP_SUPABASE.md 에 실행 순서 한 줄 추가.

## 2. API (apps/web/app/api/onboarding, api/home)

| 경로 | 방법 | 입력 | 처리 | 응답 data |
|---|---|---|---|---|
| /api/onboarding/lookup | GET ?name= | 이름 2자 이상 | participants 에서 event_id·이름 일치 검색. 최대 5명 | { candidates: [{id, display_name, affiliation, role}] } |
| /api/onboarding/token | GET ?t= | entry_token | 토큰으로 참가자 찾기 | { participant: {id, display_name, affiliation} } |
| /api/onboarding/login | POST | participant_id, pin | bcrypt 비교, 실패 5회 잠금, 성공 시 setSession | { participant: {id, display_name, role, is_admin}, consented: bool } |
| /api/onboarding/logout | POST | 없음 | clearSession | { ok } |
| /api/onboarding/consent | POST | agreed: true | consent_at 기록 | { consent_at } |
| /api/onboarding/me | GET | 세션 | participants + profiles + current_tables(tabletalk) | { participant, profile, consented, table: {table_no, label} 또는 null } |
| /api/home/orbit | GET | 세션 | 내 offer_sid 와 전원 offer_sid 비교, 링별 그룹, labels 붙임 | { me: {prefix, label}, rings: [{match_len: 3, people: [{id, display_name, affiliation, topic_tags}]}, ...], hidden_count } |
| /api/home/intro | GET | 세션 | profiles 의 offer_text, seek_text, topic_tags | { intro } |

모든 응답은 lib/api.ts 의 ok/fail. 세션은 lib/session.ts 의 requireSession. 쓰기는 lib/log.ts 로 event_log 에 남긴다(login_ok, login_fail, consent, open_home, open_orbit).

## 3. 화면 (apps/web/app/(modules)/onboarding, home)

| 경로 | 화면 | 상태 |
|---|---|---|
| /onboarding | 진입. `?t=` 있으면 토큰 조회 후 비밀번호 화면으로, 없으면 이름 입력 | 이름 검색 결과 목록, 없음 안내(운영진에게 문의) |
| /onboarding/pin | 비밀번호 4자리 입력. 숫자 키패드 | 실패 횟수와 잠금 안내 |
| /onboarding/consent | 동의 화면. 고지 4개와 체크 1개, 동의 버튼. 처리방침 링크 | 이미 동의했으면 건너뜀 |
| /onboarding/table | 로딩(테이블 정보 확인 중) → 테이블 번호와 라벨 → 홈으로 버튼 | 배정 전이면 대기 화면과 10초 재조회 |
| /home | 상단(사용설명서, 챗봇 아이콘), 궤도 SVG, 내 간단 소개 카드, 하단 메뉴 | 궤도 인원 탭 시 작은 카드 |
| /home/guide | 사용설명서 정적 페이지 | 텍스트 자리 |

공용 컴포넌트(components/): BottomNav, TopBar, PersonChip(이름·소속 칩), Loading. 이 셋은 다른 모듈도 쓴다.

라우트 보호: `app/(modules)/home/layout.tsx` 에서 getSession 이 없으면 /onboarding 으로, consented 가 아니면 /onboarding/consent 로 보낸다. 다른 모듈 담당도 같은 layout 패턴을 복사해 쓴다. 미들웨어는 두지 않는다(모듈 독립 유지).

## 4. 작업 순서 (에이전트에게 하나씩)

| 순서 | 작업 | 완료 기준 |
|---|---|---|
| 1 | 시드 확장 SQL 작성, dev DB 에 적용 | Table Editor 에서 current_tables 뷰에 10행 |
| 2 | 공용 컴포넌트 BottomNav, TopBar, PersonChip, Loading | 홈 빈 화면에 붙어서 보인다 |
| 3 | API lookup, token, login, logout, consent, me | curl 또는 브라우저로 6개 호출 확인. 잘못된 비밀번호 5회 후 423 |
| 4 | 화면 /onboarding, /onboarding/pin | 시드 참가자로 로그인되고 쿠키가 생긴다 |
| 5 | 화면 /onboarding/consent, /onboarding/table, home layout 보호 | 동의 전엔 홈 진입 불가, 동의 후 테이블 번호가 보인다 |
| 6 | API orbit, intro | 시드 기준 링1·2·3 에 사람이 나뉜다 |
| 7 | 화면 /home 궤도 SVG, 소개 카드, /home/guide | 폰 폭(375px)에서 겹침 없음. 탭하면 카드 |
| 8 | 마무리: 이벤트 로그, 빌드, Vercel 배포, 폰에서 QR 입장 확인 | 내 폰 카메라로 `/onboarding?t=tok-0002` QR 을 찍어 홈까지 간다 |

1~3은 하루, 4~5는 하루, 6~7은 하루, 8은 반나절이다. 9/28 배포 뼈대 목표에 맞는다.

## 5. 다른 모듈과 맞출 것

- BottomNav 의 링크 경로는 `/tabletalk`, `/card`, `/poster`, `/coffeechat`, `/home/chat`(비활성) 으로 고정한다. 민찬에게 알린다.
- 세션과 동의 확인 layout 패턴을 docs/MODULES.md 에 추가해 민찬 모듈도 같은 방식으로 보호한다.
- 궤도 API 의 사람 목록 형식({id, display_name, affiliation, topic_tags})은 명함·테이블토크 화면에서도 같은 칩을 쓰도록 PersonChip 에 맞춘다.

## 6. 미정이라 보류

- 사용설명서 본문과 개인정보 처리방침 1장(문구 담당 미정)
- 비밀번호 전달 방식(사전 등록 확인 메일에 넣을지, 입장 QR 옆에 인쇄할지)
- 궤도에서 공개 범위 scanned 인 사람의 이름을 가릴지(지금은 전원 이름 표시로 시작)
