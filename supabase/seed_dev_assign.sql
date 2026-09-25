-- 개발용 시드 2단계 (2026-09-25). seed.sql 다음에 실행한다. orbit-event 에는 넣지 않는다.
-- 계산 서비스가 아직 없으므로 주소(SID), 라벨, 테이블토크 배정을 손으로 넣는다.
-- 동명이인 시험용으로 김민수 두 명을 추가한다(숫자 1111, 2222). 기존 10명의 숫자는 0000.

-- 1. 동명이인 두 명
insert into participants (id, display_name, affiliation, role, cohort, is_host, login_pin_hash, entry_token) values
  ('00000000-0000-0000-0000-000000000011', '김민수', '연세대 응용통계', 'student', 14, false, crypt('1111', gen_salt('bf')), 'tok-0011'),
  ('00000000-0000-0000-0000-000000000012', '김민수', '고려대 통계', 'student', 13, false, crypt('2222', gen_salt('bf')), 'tok-0012');

insert into profiles (participant_id, offer_text, seek_text, topic_tags, intent_tags) values
  ('00000000-0000-0000-0000-000000000011', '한국어 LLM 파인튜닝 프로젝트를 하고 있다', 'NLP 현직자와 이야기하고 싶다', '{NLP·LLM}', '{취업정보}'),
  ('00000000-0000-0000-0000-000000000012', '신용평가 모델링 수업 프로젝트를 했다', '금융 데이터 현직자를 만나고 싶다', '{금융·핀테크,데이터분석}', '{멘토링}');

-- 2. 주소. K=8, 3단계. 벡터는 0 으로 채운다(화면은 벡터를 보지 않는다)
insert into sids (participant_id, offer_sid, seek_sid, offer_vec, seek_vec, codebook_version) values
  ('00000000-0000-0000-0000-000000000001', '{0,0,0}', '{0,0,0}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0'),
  ('00000000-0000-0000-0000-000000000002', '{2,1,4}', '{2,1,7}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0'),
  ('00000000-0000-0000-0000-000000000003', '{6,0,1}', '{7,2,3}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0'),
  ('00000000-0000-0000-0000-000000000004', '{1,4,3}', '{1,4,0}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0'),
  ('00000000-0000-0000-0000-000000000005', '{2,5,0}', '{2,5,3}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0'),
  ('00000000-0000-0000-0000-000000000006', '{2,1,7}', '{2,1,4}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0'),
  ('00000000-0000-0000-0000-000000000007', '{5,3,6}', '{5,3,2}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0'),
  ('00000000-0000-0000-0000-000000000008', '{2,5,3}', '{2,5,0}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0'),
  ('00000000-0000-0000-0000-000000000009', '{7,2,1}', '{7,2,1}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0'),
  ('00000000-0000-0000-0000-000000000010', '{5,3,2}', '{5,3,6}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0'),
  ('00000000-0000-0000-0000-000000000011', '{1,4,6}', '{1,4,3}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0'),
  ('00000000-0000-0000-0000-000000000012', '{5,0,2}', '{5,3,6}', array_fill(0::real, array[384]), array_fill(0::real, array[384]), 'dev-v0');

-- 3. 라벨
insert into labels (codebook_version, prefix, label) values
  ('dev-v0', '{0}',   '운영'),
  ('dev-v0', '{1}',   '언어모델·NLP 계열'),
  ('dev-v0', '{2}',   '추천·커머스·마케팅 계열'),
  ('dev-v0', '{5}',   '금융·시계열 계열'),
  ('dev-v0', '{6}',   '최적화·제조 계열'),
  ('dev-v0', '{7}',   '인과추론·연구 계열'),
  ('dev-v0', '{1,4}', 'LLM 서비스'),
  ('dev-v0', '{2,1}', '추천시스템'),
  ('dev-v0', '{2,5}', '데이터 분석·마케팅'),
  ('dev-v0', '{5,3}', '금융 시계열');

-- 4. 테이블토크 배정 (published). 테이블마다 호스트 2명
insert into assign_versions (version, round, status, params, published_at) values
  (1, 'tabletalk', 'published', '{"source":"seed_dev_assign"}', now());
select setval('assign_versions_version_seq', 1);

insert into tables_meta (version, table_no, label, talk_prompts) values
  (1, 1, '추천·데이터 분석 계열', '{"요즘 가장 재미있게 본 추천 사례는","데이터 분석에서 가장 자주 막히는 지점은"}'),
  (1, 2, '금융·최적화·연구 계열', '{"모델보다 데이터가 중요했던 경험은","연구와 실무 사이에서 고민한 적이 있는가"}');

insert into table_members (version, table_no, participant_id) values
  (1, 1, '00000000-0000-0000-0000-000000000002'),
  (1, 1, '00000000-0000-0000-0000-000000000006'),
  (1, 1, '00000000-0000-0000-0000-000000000005'),
  (1, 1, '00000000-0000-0000-0000-000000000008'),
  (1, 1, '00000000-0000-0000-0000-000000000004'),
  (1, 1, '00000000-0000-0000-0000-000000000011'),
  (1, 2, '00000000-0000-0000-0000-000000000010'),
  (1, 2, '00000000-0000-0000-0000-000000000007'),
  (1, 2, '00000000-0000-0000-0000-000000000003'),
  (1, 2, '00000000-0000-0000-0000-000000000009'),
  (1, 2, '00000000-0000-0000-0000-000000000012'),
  (1, 2, '00000000-0000-0000-0000-000000000001');

update ops_state set value = '1', updated_at = now() where key = 'published_tabletalk';

-- 확인: 아래 조회가 12행이면 성공
-- select * from current_tables order by table_no;
