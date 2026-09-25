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
