# scripts

## import_participants.py

사전 등록 CSV 를 DB 에 적재한다. 로그인 숫자는 휴대폰 뒤 4자리를 해시로만 저장하고 번호는 버린다.

```bash
pip install bcrypt supabase
python scripts/import_participants.py scripts/sample_participants.csv --dry-run
python scripts/import_participants.py 명단.csv --event-id orbit-2026 --pin-out D:/DSL/_event_data/pins.csv
```

- CSV 열: 이름, 소속, 구분(재학생·졸업생·교수·운영진·기타), 기수, 휴대폰, 하는일, 찾는사람, 주제태그, 관계태그, 호스트(예/아니오). 열 이름이 다르면 `--map phone=전화번호` 처럼 맞춘다.
- 10/17 구글폼(자유 문장 없음)이면 재직(정규직 · 인턴(회사) · 학부연구생(연구실 인턴) · 재직 중 아님) · 직책 · 관심도메인 열을 더한다. 구분(경력, DB 0015)을 정하고, 학생은 관심 도메인을 주제태그로 쓴다. 자세한 규칙은 `import_participants.py` 맨 위 설명.
- 10/18 사전 등록 구글폼(성하 · 민찬)을 시트에서 CSV 로 받으면 그대로 넣는다. 열 이름(질문 문장)을 앞부분으로 찾는다. 재학생 · 졸업생 · 타 학회원 섹션이 같은 질문을 되풀이해 생기는 같은(또는 앞부분이 같은) 열은 합쳐 처음 채워진 값을 쓴다.
- 구분 여러 개(DB 0017 careers)는 '해당하는 경험을 모두 골라 주세요'(기업 재직 · 기업 인턴 · 창업 · 학부연구생 · 대학원) + 학년 · 직책 칸 말(석사 · 박사 → 대학원생, 학부연구생 · 연구실 인턴 → 학부연구생) + 재학생(대학원생이 아니면 학생) · 타 학회원(직책 칸에 학부 · 학년 · 재학이 있으면 학생) · 교수(교수만) · 기타(외부연사 등, 재직자 + 창업자. 외부연사가 CEO)로 정한다. 경험 열이 없는 CSV 는 예전처럼 구분 하나(career)만 정한다(졸업생 = 재직자 · 재학생 = 학년 칸으로 대학원생 · 학부연구생 · 학생, 그 밖 = 모름). 구분이 빈 행(앱 동의 안 함)은 건너뛴다. 적재 전에 0017 을 적용한다.
- 휴대폰이 빈 사람은 무작위 4자리를 받고 `--pin-out` 파일에 이름과 함께 적힌다. 이 파일은 저장소 밖에 둔다.
- 실제 명단 CSV 는 저장소에 올리지 않는다(.gitignore 가 *.csv 를 막는다. sample 만 예외).
- 적재 뒤에는 계산 서비스 `/precompute` 로 주소와 테이블토크 배정을 만든다.
- 같은 사람(event_id + 이름 + 소속)이 이미 있으면 새로 만들지 않고 갱신한다. 명찰 QR 이 participant id 를 담으므로 id 가 바뀌면 안 된다. 기존 사람의 숫자는 휴대폰 열이 있을 때만 다시 계산한다.
- `--names-only` 는 이름·소속·구분·기수만 넣는다. 사전 등록 명단으로 먼저 id 를 발급해 명찰 QR 을 인쇄하고, 프로필·숫자는 나중에 전체 적재로 채우는 순서다(빈 명함 → 채워진 명함).
- `--fixed-names` 는 1번 테이블(교수 · 운영진석)에 고정할 이름이다(10/21 민찬 결정). 구글폼 CSV 에는 고정테이블 열도 운영진 구분도 없어서 이름으로 정한다. 행사장 10테이블 중 1번 = 운영진 7 + 연사 교수 3 = 10명이고, 나머지는 계산 서비스가 2~10번에 고르게 앉힌다. 쉼표 목록 또는 이름을 줄마다 적은 텍스트 파일 경로를 받는다. 표시 이름과 글자까지 같아야 맞는다. 주면 목록이 기준이라 목록 밖 사람의 고정은 비운다. CSV 에 없는 이름은 줄마다 알리고, 고정 인원이 10명이 아니면 경고한다.
- `--exclude` 는 명단에서 뺄 이름(오지 않는 사람)이다. 형식은 `--fixed-names` 와 같다. 뺀 사람과 CSV 에 없는 이름을 찍는다. 이미 DB 에 들어간 사람은 지우지 않으므로(계산 서비스가 그 사람도 앉힌다) DB 에 있으면 경고한다.
- 두 옵션 모두 `--names-only` · `--dry-run` 과 같이 쓴다. 10/31 행사 명단은 먼저 dry-run 으로 인원을 보고 적재한다.

```bash
# 저장소밖/table1.txt: 운영진 7명 + 연사 교수 3명 이름을 줄마다
python scripts/import_participants.py 명단.csv --event-id orbit-2026 --pin-out 저장소밖/pins.csv --fixed-names 저장소밖/table1.txt --exclude "배소윤,박현진" --dry-run
python scripts/import_participants.py 명단.csv --event-id orbit-2026 --pin-out 저장소밖/pins.csv --fixed-names 저장소밖/table1.txt --exclude "배소윤,박현진"
```

## export_badge_qr.py

명찰에 인쇄할 명함 QR PNG 를 참가자마다 낸다. 문자열은 `docs/QR_FORMAT.md` 의 `https://<앱주소>/card?p=<participant_id>` 다.

```bash
pip install qrcode[pil] supabase
python scripts/export_badge_qr.py --event-id orbit-2026 --app-url https://<배포주소> --out D:/DSL/_event_data/badges
```

- 결과 폴더의 `index.csv`(이름, 소속, 구분, id, 파일명)를 명찰 디자인 쪽에 넘긴다. 저장소에 올리지 않는다.
- 운영진은 기본으로 빼고, `--include-staff` 로 넣는다.

## export_poster_qr.py

포스터 앞에 붙일 포스터 QR PNG 를 포스터마다 낸다. 문자열은 `docs/QR_FORMAT.md` 의 `https://<앱주소>/poster?c=<poster_code>` 다. 포스터 목록은 DB 의 posters 표에서 읽는다.

```bash
pip install qrcode[pil] supabase
python scripts/export_poster_qr.py --app-url https://orbit-app-dusky-theta.vercel.app --out D:/DSL/_event_data/posters --label
python scripts/export_poster_qr.py --app-url http://localhost:3000 --out /tmp/posters --codes P01,P02   # DB 없이 코드만으로
```

- 결과 폴더에 포스터별 `<code>.png`, 전부 이어 붙인 `sheet.png`(화면에 띄우고 폰으로 찍어 보는 데모용), `index.csv`(코드, 제목, 발표자, 부스, 파일명)가 생긴다. 저장소에 올리지 않는다.
- `--label` 을 주면 QR 아래에 코드 · 제목 · 부스를 같이 그린다. 인쇄용은 이 옵션이 편하다.
- 개발 서버로 폰 테스트를 할 때는 `--app-url http://<맥 IP>:3000` 처럼 같은 와이파이 주소를 준다. 폰 기본 카메라로 찍으면 링크가 열린다(앱 안 카메라는 https 에서만 열린다).

## build_posters.py

포스터 세션의 포스터 목록 SQL, 자리별 QR, 퀴즈 SQL 을 낸다. DB 없이 돈다.

```bash
pip install qrcode[pil]
python scripts/build_posters.py --out D:/DSL/_event_data/poster_kit --quizzes D:/DSL/_event_data/quizzes.json
```

- 포스터 목록의 정본은 `event_posters.json`(제목 · 발표자 · 태그 · 요약 · 발표자 이름)이다. 요약은 발표자 글이라 문체를 앱에 맞추지 않는다. 부스(booth)는 JSON 에 있을 때만 들어가고, 없으면 SQL 이 null 로 덮어써 예전 seed 값(A1 · B2)을 지운다(10/21). 고친 뒤 스크립트를 돌리면 `supabase/event_posters.sql` 이 다시 만들어진다. 둘을 같은 PR 에 넣는다.
- 포스터 코드는 행사장 자리 번호다(1번 자리 = P01, 11번 자리 = P11). 앱 포스터 목록은 코드 순서라 목록 번호가 자리 번호와 같다.
- 적용 순서: Supabase SQL Editor 에서 `supabase/event_posters.sql` → `<out>/poster_quizzes.sql`. 둘 다 여러 번 실행해도 결과가 같다. 명단 적재 뒤 한 번 더 실행하면 presenter_ids(발표자 본인 응답 제외)가 채워진다.
- 퀴즈 파일과 `poster_quizzes.sql` 에는 정답이 들어가므로 저장소 밖에 둔다(저장소가 공개다). 형식은 `sample_quizzes.json`.
- 요약(summary)은 앱에서 퀴즈 버튼 바로 위에 보이므로 퀴즈 정답을 적지 않는다. 퀴즈는 보기 2개(10/5 회의).
- QR 에는 코드만 들어가므로 먼저 인쇄해도 된다. 인쇄는 A1 포스터 기준 한 변 8cm 이상, 흰 여백을 자르지 않는다. 벡터가 필요하면 `qr_svg` 를 쓴다.
- `export_poster_qr.py` 는 DB 에 이미 들어간 포스터로 QR 만 다시 뽑을 때 쓴다. 두 스크립트의 QR 문자열은 같다.
