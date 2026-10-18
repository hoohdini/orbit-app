-- 2026-10-18. 구분(경력)에 학부연구생(lab_intern, 연구실 인턴) 추가(민찬). 0015 다음에 실행한다.
--   lab_intern 학부연구생(연구실 인턴) → 대학원진학 · 연구협업 0.5 + 스터디 · 프로젝트팀원(대학원생보다 한 단계 낮게, 계산 서비스 scoring.GIVES)
-- 0015 의 check 에 값을 더한다. 0015 를 이미 적용한 DB 에서도 다시 실행해도 안전하게 지우고 새로 만든다.
-- 회사 인턴은 그대로 employed. 명단 적재(scripts/import_participants.py)가 재직 '학부연구생(연구실 인턴)' 또는 직책의 학부연구생 · 연구실 인턴 · 랩 인턴으로 가른다.
alter table participants drop constraint if exists participants_career_check;
alter table participants add constraint participants_career_check
  check (career in ('employed', 'grad', 'lab_intern', 'student', 'professor'));
