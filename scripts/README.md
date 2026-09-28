# scripts

## import_participants.py

사전 등록 CSV 를 DB 에 적재한다. 로그인 숫자는 휴대폰 뒤 4자리를 해시로만 저장하고 번호는 버린다.

```bash
pip install bcrypt supabase
python scripts/import_participants.py scripts/sample_participants.csv --dry-run
python scripts/import_participants.py 명단.csv --event-id orbit-2026 --pin-out D:/DSL/_event_data/pins.csv
```

- CSV 열: 이름, 소속, 구분(재학생·졸업생·교수·운영진·기타), 기수, 휴대폰, 하는일, 찾는사람, 주제태그, 관계태그, 호스트(예/아니오). 열 이름이 다르면 `--map phone=전화번호` 처럼 맞춘다.
- 휴대폰이 빈 사람은 무작위 4자리를 받고 `--pin-out` 파일에 이름과 함께 적힌다. 이 파일은 저장소 밖에 둔다.
- 실제 명단 CSV 는 저장소에 올리지 않는다(.gitignore 가 *.csv 를 막는다. sample 만 예외).
- 적재 뒤에는 계산 서비스 `/precompute` 로 주소와 테이블토크 배정을 만든다.
- 같은 사람(event_id + 이름 + 소속)이 이미 있으면 새로 만들지 않고 갱신한다. 명찰 QR 이 participant id 를 담으므로 id 가 바뀌면 안 된다. 기존 사람의 숫자는 휴대폰 열이 있을 때만 다시 계산한다.
- `--names-only` 는 이름·소속·구분·기수만 넣는다. 사전 등록 명단으로 먼저 id 를 발급해 명찰 QR 을 인쇄하고, 프로필·숫자는 나중에 전체 적재로 채우는 순서다(빈 명함 → 채워진 명함).

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
