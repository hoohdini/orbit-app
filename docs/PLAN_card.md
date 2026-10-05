# 명함 구현 계획 (성하, 2026-09-26)

피그마 화면플로우의 명함탭(내 명함, 명함 QR 스캔, 타인 명함 저장, 명함함)을 구현한다. 스키마(`card_exchanges`, `profiles.links`, `participants.visibility`)와 QR 형식(`docs/QR_FORMAT.md`)은 이미 고정돼 있으므로 그 위에 얹는다. 명함 교환은 계산 서비스가 `edges` 뷰로 읽어 커피챗 점수에 반영하므로, 스캔 한 건이 DB 에 정확히 남는 것이 이 모듈의 핵심이다.

## 0. 흐름 (9/26 수정)

1. 명찰: 참가자마다 명찰에 자기 명함 QR 이 인쇄돼 있다. 문자열은 `https://<앱주소>/card?p=<participant_id>` 다. 그러려면 명찰 인쇄 전에 participants 행(id)이 있어야 한다.
2. 빈 명함: 사전 등록 명단만 넣은 시점에는 이름 · 소속만 있는 빈 명함이다. 프로필(하는 일 · 찾는 사람 · 태그 · 링크)이 들어오면 채워지고, 전날 계산 서비스가 주소(SID) 와 라벨을 발급하면 명함 디자인(색 · 라벨)이 자동으로 정해진다. 화면은 세 단계를 같은 카드 컴포넌트로 그린다.
3. 스캔: A 가 B 의 명찰 QR 을 찍으면(앱 스캐너 또는 내장 카메라) 한 번에 양방향으로 교환된다. A 의 명함함에 B 가, B 의 명함함에 A 가 들어간다.
4. 알림: B 의 화면에 "A 님에게 명함이 공유되었습니다" 가 뜨고 A 의 명함이 같이 보인다. 푸시는 없으므로 앱이 15초마다 새 교환을 물어본다.
5. 명함함: 내가 가진 명함 목록(최근 순). 내가 찍은 것과 상대가 찍어서 받은 것을 구분해 표시한다.

## 0-1. 먼저 정할 것 (구현 전 결정)

| 항목 | 결정안 | 이유 |
|---|---|---|
| 교환 방향 | 스캔 1건 = `card_exchanges` 2행(A→B, B→A). `source` 컬럼으로 구분한다. 찍은 쪽 행은 `qr` 또는 `manual`, 받은 쪽 행은 `auto` | 한쪽만 찍어도 둘 다 갖는다. `edges` 뷰는 least/greatest 로 묶으므로 2행이어도 간선은 1개다. 계산 서비스는 `edges` 뷰만 읽어 영향이 없다 |
| 알림 저장 | `card_exchanges` 에 `seen_at` 컬럼 추가. 받은 쪽(`source=auto`) 행의 `seen_at` 이 null 이면 아직 안 본 알림 | 표를 새로 만들지 않는다. 마이그레이션 `0004_card_exchange_source.sql` 하나 |
| 알림 전달 | 명함 탭 화면들이 15초마다 `/api/card/inbox` 를 물어 토스트로 띄운다. 하단 메뉴 "명함" 에 안 본 수 배지 | 궤도와 같은 폴링 방식. 실시간 채널은 두지 않는다 |
| 공개 범위(`visibility`) | 이름 · 소속 · 주소 · 라벨 · 하는 일 · 태그는 명함을 가진 사람 누구에게나 보인다. 링크는 `all` 이면 누구에게나, `scanned`(기본) 면 "내가 직접 찍은 상대" 에게만 보인다 | 양방향 자동 교환이라 상대는 내 동의 없이 내 명함을 받는다. 연락처 성격인 링크는 내가 찍은 사람(내가 고른 상대)에게만 열리는 것이 기본이다 |
| 공개 범위 변경 · 링크 편집 | 내 명함 화면에서 토글과 링크(linkedin, github, email, url) 편집. `POST /api/card/settings` | 사전 등록 폼에 링크 항목이 없을 수 있다 |
| 자기 QR 스캔 | 400 `SELF_SCAN` | 저장할 것이 없다 |
| 같은 사람 반복 스캔 | 이미 두 행이 있으면 새로 넣지 않고 `already_saved: true` 로 같은 명함을 돌려준다. 60초 안 반복은 `event_log` 에 `scan_fail`(reason repeat) | QR_FORMAT.md 규칙 5. 알림은 처음 한 번만 |
| 다른 행사 참가자 | `event_id` 가 다르면 404 | 개발 DB 에 행사가 섞여 있다(sim-minchan 등) |
| 카메라 거부 시 대체 | 이름 검색으로 상대를 찾아 같은 scan API 를 부른다(`source=manual`). 검색은 체크인된 사람만 | QR_FORMAT.md 스캐너 항목. 물리 QR 없이도 되므로 채점에서 manual 을 뺄 수 있게 남긴다 |
| 미리보기 없이 즉시 저장 | `/card?p=` 가 열리면 확인 단계 없이 교환하고 결과 화면을 보여 준다 | 행사장에서 두 번 누르게 하지 않는다. 중복은 멱등이라 부담이 없다 |
| 빈 명함 단계 | 1단계 명단만(이름 · 소속 · 역할) → 2단계 프로필(하는 일 · 찾는 사람 · 태그 · 링크) → 3단계 주소(SID · 라벨 · 색). 없는 항목은 "아직 채워지지 않았다" 자리로 그린다 | 사용자 정보 수합 전에도 명찰 QR 이 유효해야 한다 |
| 명함 디자인 자동 생성 | 주소 앞자리(offer_sid[0], 0~7)로 색상 테마 8종을 정하고, 라벨을 부제로 쓴다. 주소 전에는 회색 테마 | 코드북 K=8 이라 계열마다 색이 다르다. 그림 파일 없이 CSS 로 끝난다 |
| 참가자 id 고정 | 적재 스크립트를 이름 + 소속 + event_id 기준 upsert 로 바꾼다. 재적재해도 id 가 바뀌지 않는다 | 지금은 insert 만 해서 다시 돌리면 새 id 가 생겨 인쇄한 명찰 QR 이 죽는다 |
| QR 문자열의 앱 주소 | 서버가 요청의 origin 으로 만든다. 명찰 인쇄용은 스크립트가 `--app-url` 로 받는다 | localhost 와 Vercel 배포 주소 모두 맞는다 |
| QR 그리기 | 앱 안은 `qrcode.react`(SVG). 명찰 인쇄용은 `scripts/export_badge_qr.py` 가 participant 별 PNG 를 낸다 | 앱과 인쇄가 같은 문자열을 쓴다 |
| QR 읽기 | `html5-qrcode`, `components/QrScanner.tsx` 공용 컴포넌트 | MODULES.md 에 공용으로 정해져 있다. 포스터 모듈도 같은 컴포넌트를 쓴다 |
| 스캐너의 다른 QR 처리 | `/poster?c=` 를 읽으면 그 경로로 이동만 한다 | 모듈끼리 import 하지 않는다 |

## 1. 마이그레이션과 시드

`supabase/migrations/0004_card_exchange_source.sql`

```sql
alter table card_exchanges
  add column source  text not null default 'qr' check (source in ('qr','manual','auto')),
  add column seen_at timestamptz;
create index on card_exchanges (scanner_id, seen_at) where source = 'auto';
```

`edges` 뷰는 그대로 둔다. `supabase/seed_dev_card.sql` 을 새로 만든다(개발용).

- profiles.links: 시드 참가자 4명에게 linkedin · github · email.
- participants.visibility: 2명을 `all` 로.
- card_exchanges: 학생 A 가 2명을 찍음(qr 2행 + auto 2행), 1명이 A 를 찍음(상대 qr 1행 + A 쪽 auto 1행, seen_at null → 알림 시험용).
- 빈 명함 시험용으로 profiles 행이 없는 참가자 1명, sids 가 없는 참가자 1명.
- SETUP_SUPABASE.md 에 실행 순서 한 줄 추가.

## 2. API (apps/web/app/api/card)

| 경로 | 방법 | 입력 | 처리 | 응답 data |
|---|---|---|---|---|
| /api/card/me | GET | 세션 | participants + profiles(없으면 null) + sids(없으면 null) + 명함 수. qr_payload 는 요청 origin + `/card?p=<id>`. `stage` 는 1 · 2 · 3 | { card, qr_payload, stage, wallet_count, unseen_count } |
| /api/card/scan | POST | qr_payload, source?(qr 기본, manual) | `/card?p=<uuid>` 파싱 → 본인 400 → 같은 행사 참가자 없으면 404 → 두 행 insert(unique 충돌은 already_saved) → 공개 범위 적용해 상대 명함 구성 | { card, already_saved } |
| /api/card/wallet | GET | 세션 | 내가 가진 명함 전부(scanner_id = 나), 최근 순. 각 항목에 `source`(qr · manual · auto) 와 공개 범위 적용 | { cards: [card…] } |
| /api/card/inbox | GET | 세션 | `source=auto and seen_at is null` 인 행의 상대 명함 | { new: [card…] } |
| /api/card/inbox/seen | POST | ids[] 또는 all | seen_at 기록 | { seen: n } |
| /api/card/search | GET | q(2자 이상) | 같은 행사 · 체크인된 사람 중 이름 부분 일치 최대 10명. 본인 제외 | { people: [{id, display_name, affiliation}] } |
| /api/card/settings | POST | visibility?, links? | 본인 visibility, links 갱신. links 는 키 4개, URL 형식 검증 | { visibility, links } |

`card` 객체 하나의 모양(모든 응답이 같다): `{ id, display_name, affiliation, role, cohort, stage, sid: number[] | null, label, theme: 0~7 | null, offer_text, seek_text, topic_tags, links: {…} | null, source?, exchanged_at? }`.

공개 범위와 파싱은 `api/card/_lib.ts` 의 순수 함수로 둔다. `visibleLinks(targetVisibility, iScannedThem, links)`, `parseCardId(raw)`, `themeOf(sid)`, `stageOf(profile, sid)`. event_log: `open_card`, `card_scan`(source, target_id), `scan_fail`(reason invalid_qr | self | unknown | repeat), `open_wallet`, `card_seen`, `card_settings`. 시제품(10/5 민찬 제안): `keyword_search`(q, hits, semantic, aliases = 줄임말 사전으로 함께 찾은 표기 수).

## 3. 화면 (apps/web/app/(modules)/card)

| 경로 | 화면 | 상태 |
|---|---|---|
| /card | 내 명함. `CardView`(테마 색, 이름 · 소속 · 역할, 주소 · 라벨, 하는 일 · 찾는 사람 · 태그, 링크), QR(SVG, 화면 폭의 60%), 공개 범위 토글, 링크 편집(펼침), 버튼 두 개(스캔하기, 명함함 N) | 1 · 2단계는 빈 자리 문구. `?p=<id>` 가 붙어 있으면 이 화면 대신 교환 결과 화면 |
| /card?p=<id> | 교환 결과. "B 님과 명함을 교환했다" + 상대 `CardView` + 이미 있었으면 안내 | 본인 · 없는 사람 · 형식 오류는 안내 문구와 스캔 화면 버튼 |
| /card/scan | 카메라 스캐너. 읽으면 `/card?p=` 는 scan API, `/poster?c=` 는 그 경로로 이동. 아래에 이름 검색 칸 | 카메라 권한 거부 안내 |
| /card/wallet | 명함함. 목록(PersonChip + 받은 것은 "받음" 표시 + 탭하면 `CardView` 펼침) | 비어 있으면 스캔 유도 |
| (공통) | `CardInbox` 클라이언트 컴포넌트. 명함 탭 화면마다 붙어 15초마다 inbox 를 물어 토스트 "A 님에게 명함이 공유되었습니다" 와 상대 명함을 띄우고, 닫으면 seen 처리 | |

`components/QrScanner.tsx`(html5-qrcode 감싸기, `onDecode(text)`, `onDenied()`)는 공용이다. `CardView`, `CardInbox` 는 모듈 안(`card/`)에 둔다. 하단 메뉴 배지는 `BottomNav` 가 `/api/card/inbox` 의 수만 받아 그린다(모듈 컴포넌트를 import 하지 않고 URL 만 부른다).

라우트 보호: `app/(modules)/card/layout.tsx` 는 home layout 을 복사한다. `/card?p=` 로 들어온 비로그인 사용자는 온보딩 뒤 돌아와야 하므로 `redirect("/onboarding?next=...")` 로 보내고, 온보딩 로그인 성공 시 `next` 가 있으면 그리로 보낸다(온보딩 page.tsx 한 줄 수정).

## 4. 스크립트

- `scripts/import_participants.py`: insert 를 (event_id, display_name, affiliation) 기준 upsert 로 바꾼다. 같은 사람을 다시 넣으면 id 가 유지되고 프로필만 갱신된다. `--names-only` 옵션으로 1단계(이름 · 소속 · 구분만) 적재를 허용한다. 동명이인 · 동소속은 경고하고 건너뛴다.
- `scripts/export_badge_qr.py --event-id orbit-2026 --app-url https://<배포주소> --out D:/DSL/_event_data/badges/`: 참가자별 `<이름>_<id앞8자>.png` 와 명단 CSV(이름, 소속, 파일명)를 낸다. 명찰 디자인 쪽에 넘긴다.

## 5. 작업 순서

| 순서 | 작업 | 완료 기준 |
|---|---|---|
| 1 | 마이그레이션 0004, 시드 `seed_dev_card.sql`, dev DB 적용 | `edges` 뷰에 3행, A 의 안 본 알림 1건 |
| 2 | `api/card/_lib.ts` + API me, scan, wallet, inbox, inbox/seen, search, settings | curl 로 A 세션: scan 하면 두 행이 생기고 B 의 inbox 에 A 가 뜬다. 재스캔은 already_saved. 본인은 SELF_SCAN. B(`scanned`)의 링크는 A 에게 보이지만, A 의 링크는 B 에게 안 보인다 |
| 3 | 의존성 `qrcode.react`, `html5-qrcode`. `components/QrScanner.tsx` | 로컬에서 카메라가 열리고 문자열이 콘솔에 찍힌다 |
| 4 | `CardView`(테마 8색 + 빈 단계), 화면 /card(내 명함, QR, 토글, 링크 편집), card layout 보호 | 375px 에서 겹침 없음. 프로필 없는 시드 참가자는 빈 명함, 주소 없는 참가자는 회색 |
| 5 | 화면 /card?p=(교환 결과), /card/scan(스캐너 + 이름 검색), 온보딩 `next` | 두 브라우저로 A · B 로그인. A 가 B 의 QR 을 읽으면 결과가 뜨고 둘 다 wallet 에 들어간다 |
| 6 | `CardInbox` 토스트 + BottomNav 배지, 화면 /card/wallet | B 화면에 15초 안에 "A 님에게 명함이 공유되었습니다" 가 뜨고 닫으면 배지가 사라진다 |
| 7 | 스크립트 upsert 전환, 명찰 QR 내보내기 | 샘플 CSV 를 두 번 적재해도 id 가 같다. PNG 를 폰 카메라로 찍으면 `/card?p=` 가 열린다 |
| 8 | `npm run build`, API.md · SCHEMA.md 갱신, main push → Vercel 배포, 폰으로 실제 교환 확인 | 배포 주소에서 카메라가 열리고 폰 두 대로 교환과 알림이 된다 |

1~3 은 오늘, 4~6 은 내일, 7~8 은 그다음 날이다.

## 6. 다른 모듈과 맞출 것

- `components/QrScanner.tsx` 인터페이스를 민찬에게 알린다. 포스터 화면이 같은 것을 쓴다.
- `card_exchanges` 에 컬럼 2개가 늘지만 계산 서비스는 `edges` 뷰만 읽으므로 손댈 것이 없다. `MemoryRepo.edges()` 도 scanner/scanned 만 본다.
- 교환 수 집계 규칙(9/26 확정): 명함은 서로 주고받는 것이므로 교환 1건 = 각자 +1, 전체 +2 다. 행 수를 그대로 세고 2로 나누지 않는다. 운영 콘솔의 `exchanges` 도 행 수다.
- BottomNav 가 명함 알림 수를 그리게 되므로 공용 컴포넌트가 card API 를 부른다. MODULES.md 에 "공용 컴포넌트는 URL 만 부른다" 를 한 줄 추가한다.
- API.md 의 card 세 줄을 "있음" 으로 바꾸고 inbox · inbox/seen · search · settings 를 추가한다. SCHEMA.md 의 "명함 교환 양방향 여부" 항목을 닫는다.

## 7. 미정이라 보류

- 링크 키 목록(linkedin, github, email, url). 사전 등록 폼이 정해지면 맞춘다.
- 알림을 홈 화면에서도 띄울지. 지금은 명함 탭 안 토스트와 하단 메뉴 배지까지만.
- 명찰 QR 을 uuid 대신 짧은 코드로 바꿀지. 인쇄 QR 이 너무 조밀하면 `entry_token` 컬럼(예비)을 짧은 코드로 써서 `/card?p=` 에 담을 수 있다.
