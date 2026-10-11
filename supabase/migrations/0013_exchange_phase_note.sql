-- 2026-10-11. 피그마 명함 화면 연결(성하). 0012 다음에 실행한다.
-- 1. card_exchanges.phase: 교환이 생긴 때의 행사 단계(lib/phase.ts 의 9개 값). 명함 목록의 어디서 만났나 칩(전체 · 테이블 · 포스터 · 커피챗)에 쓴다.
--    한 번 찍으면 생기는 두 행에 같은 값을 넣는다. 단계를 고르지 않은 개발 DB 이거나 이 마이그레이션 전 행은 null(전체에만 보인다).
--    포스터 번호까지는 남기지 않는다(직전 포스터 스캔으로 추정하면 틀리기 쉬워서, 10/11 성하 결정)
-- 2. note 길이 상한 100 → 200. 명함 상세 화면의 메모 칸이 커서 따로 저장하는 API(/api/card/note)를 두면서 늘린다
alter table card_exchanges add column phase text;

alter table card_exchanges drop constraint if exists card_exchanges_note_check;
alter table card_exchanges add constraint card_exchanges_note_check check (char_length(note) <= 200);
