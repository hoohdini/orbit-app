-- 2026-10-18. 참가자 구분(경력) 칸(민찬). 0014 다음에 실행한다.
-- 추천 10명 점수의 '줄 수 있는 것' 규칙(계산 서비스 pipeline/scoring.py 의 GIVES)이 상대의 구분을 본다.
--   employed  재직(정규직 · 인턴)            → 취업정보 · 이직정보 · 채용 · 멘토링
--   grad      대학원생(석사 · 박사과정)        → 대학원진학 · 연구협업
--   lab_intern 학부연구생(연구실 인턴)         → 대학원진학 · 연구협업 0.5 + 스터디 · 프로젝트팀원(대학원생보다 한 단계 낮게)
--   student   그 밖의 학생(수료했어도 재학이면 여기) → 스터디 · 프로젝트팀원
--   professor 교수                           → 대학원진학 · 연구협업 · 멘토링
--   null      모름(예전 명단). 규칙 점수가 0 이 되고 나머지 점수로만 추천한다
-- 구글폼 '재직 여부' · '직책'에서 명단 적재 스크립트(scripts/import_participants.py)가 정한다.
-- 기존 role(재학생 · 졸업생 · 교수 · 운영진 · 기타)은 그대로 둔다. role 은 세대 연결 미션이 쓰고, 수료했어도 학생일 수 있어 경력과 다르다(10/18 민찬).
alter table participants add column if not exists career text
  check (career in ('employed', 'grad', 'lab_intern', 'student', 'professor'));
