-- 개발용 시드 3단계: 명함 (2026-09-26). 0004 마이그레이션과 seed_dev_assign.sql 다음에 실행한다. orbit-event 에는 넣지 않는다.
-- 실명·실제 연락처는 넣지 않는다. 링크는 가짜 주소다.

-- 1. 링크. 학생 A, 학생 C, 졸업생 E, 졸업생 F
update profiles set links = '{"linkedin":"https://www.linkedin.com/in/student-a","github":"https://github.com/student-a","email":"student-a@example.com"}' where participant_id = '00000000-0000-0000-0000-000000000002';
update profiles set links = '{"github":"https://github.com/student-c"}' where participant_id = '00000000-0000-0000-0000-000000000004';
update profiles set links = '{"linkedin":"https://www.linkedin.com/in/alumni-e","url":"https://alumni-e.example.com"}' where participant_id = '00000000-0000-0000-0000-000000000006';
update profiles set links = '{"email":"alumni-f@example.com"}' where participant_id = '00000000-0000-0000-0000-000000000007';

-- 2. 공개 범위. 학생 B 와 졸업생 E 는 전체 공개, 나머지는 기본(scanned)
update participants set visibility = 'all' where id in ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006');

-- 3. 빈 명함 시험용. 워크인 J 는 프로필도 주소도 없다(1단계). 학생 K 는 프로필만 있고 주소가 없다(2단계). 숫자는 0000
insert into participants (id, display_name, affiliation, role, cohort, is_host, login_pin_hash) values
  ('00000000-0000-0000-0000-000000000013', '워크인 J', null, 'other', null, false, crypt('0000', gen_salt('bf'))),
  ('00000000-0000-0000-0000-000000000014', '학생 K', '서강대 경제', 'student', 15, false, crypt('0000', gen_salt('bf')));
insert into profiles (participant_id, offer_text, seek_text, topic_tags, intent_tags) values
  ('00000000-0000-0000-0000-000000000014', '계량경제 수업 프로젝트로 소비 데이터를 분석했다', '데이터 분석 인턴 경험자를 만나고 싶다', '{데이터분석}', '{취업정보}');

-- 4. 교환. 한 번 찍으면 두 행이다
-- 학생 A 가 졸업생 E 를 찍음
insert into card_exchanges (scanner_id, scanned_id, source, seen_at) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'qr',   null),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', 'auto', now());
-- 학생 A 가 학생 B 를 찍음
insert into card_exchanges (scanner_id, scanned_id, source, seen_at) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'qr',   null),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'auto', null);
-- 졸업생 F 가 학생 A 를 찍음. A 쪽 auto 행의 seen_at 이 null 이라 A 에게 알림이 하나 떠 있다
insert into card_exchanges (scanner_id, scanned_id, source, seen_at) values
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002', 'qr',   null),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000007', 'auto', null);

-- 확인
-- select * from edges;                                                        -- dev 참가자끼리 3행
-- select count(*) from card_exchanges where scanner_id = '00000000-0000-0000-0000-000000000002';   -- 3 (A 의 명함함)
-- select count(*) from card_exchanges where scanner_id = '00000000-0000-0000-0000-000000000002' and source = 'auto' and seen_at is null;  -- 1 (A 의 안 본 알림)
