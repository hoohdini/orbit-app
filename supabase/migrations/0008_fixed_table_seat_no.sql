-- 2026-10-05. 개발 지시서 v0.2 B-02 · B-03 (민찬).
-- 1. participants.fixed_table: 교수 · 운영진석처럼 운영진이 미리 정한 테이블 번호(보통 1). 값이 있으면 계산 서비스가 그 테이블에 고정하고 배정 알고리즘에서 뺀다
-- 2. table_members.seat_no: 테이블 안 좌석 번호(1부터, 원형 테이블에서 시계 방향). 테이블토크만 채운다. 명찰 출력 · 테이블토크 화면 정렬에 쓴다
-- 3. current_tables 뷰 끝에 seat_no 를 붙인다(칸은 끝에만 붙일 수 있음)
-- 4. participants.teams: 같이 한 프로젝트 · 스터디 팀 이름 목록(예: {'25-2 추천시스템', '26-1 LLM 스터디'}). 같은 팀을 한 적 있으면
--    이미 아는 사이로 보고 추천 목록에서 뒤로 미룬다(10/5 민찬 제안). 명단 CSV 의 '활동팀' 열(; 로 구분)
alter table participants add column fixed_table smallint check (fixed_table > 0);
alter table participants add column teams text[] not null default '{}';
alter table table_members add column seat_no smallint check (seat_no > 0);

create or replace view current_tables as
select v.round, m.version, m.table_no, m.participant_id, t.label, v.event_id, m.seat_no
from assign_versions v
join table_members m on m.version = v.version
left join tables_meta t on t.version = m.version and t.table_no = m.table_no
where v.status = 'published'
  and v.version = (select max(version) from assign_versions x
                   where x.round = v.round and x.event_id = v.event_id and x.status = 'published');
