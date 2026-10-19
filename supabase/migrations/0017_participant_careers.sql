-- 2026-10-19. 참가자 구분(경력) 여러 개(민찬). 0016 다음에 실행한다.
-- 사전 등록 폼에 '해당하는 경험을 모두 골라 주세요'(기업 재직 · 기업 인턴 · 학부연구생 · 대학원 · 해당 없음, 복수)를 넣었다(10/18 팀 컨펌).
-- 한 사람이 기업 인턴을 해 본 재학생 · 석사 뒤 재직자처럼 여러 구분을 가질 수 있어 career(0015, 하나) 옆에 배열로 둔다.
--   employed 기업 재직 · intern 기업 인턴(취업 · 커리어 0.5, 재직자보다 한 단계 낮게) · grad 대학원 · lab_intern 학부연구생
--   student 재학생(대학원생이 아니면) · 타 학회원(직책 칸에 학부 · 학년 · 재학) · professor 교수
--   founder 창업자(창업 · 사이드 1). 구분 '기타(외부연사 등)' = employed + founder(외부연사 두 분이 CEO)
-- 추천 '줄 수 있는 것' 규칙(계산 서비스 scoring.WANTS)은 이 칸을 먼저 보고 선택지마다 가장 높은 값을 쓴다. 비었으면(null) career 를 본다.
-- 명단 적재(scripts/import_participants.py)가 폼 경험 문항 · 구분 · 학년 · 직책으로 정한다. career 는 그대로 채운다(예전 계산 서비스 · 화면용).
-- check 는 이름을 붙여 따로 만든다(값을 더할 때 0016 처럼 지우고 다시 만들 수 있게, 이미 적용한 DB 에서 다시 실행해도 안전).
alter table participants add column if not exists careers text[];
alter table participants drop constraint if exists participants_careers_check;
alter table participants add constraint participants_careers_check
  check (careers <@ array['employed', 'intern', 'grad', 'lab_intern', 'student', 'professor', 'founder']::text[]);
