-- 2026-10-06. 개발 지시서 v0.2 B-10 나머지 (성하). 0009 다음에 실행한다.
-- 1. participants.consent_refused_at: 이용 동의를 거부한 시각(H-00). 10/5 회의 결정: 거부자도 사전 등록 정보로 배정에는 들어가고,
--    행사 중 수집(명함 교환, 만족도, 포스터 응답, 검색어)만 하지 않는다. 다른 사람의 추천 · 이름 검색 · 궤도에서도 빠진다.
--    다시 동의하면 null 로 돌리고 consent_at 을 채운다. 둘 다 null 이면 아직 고르지 않은 사람이다
-- 2. card_exchanges 에 칸 추가(H-05, H-05-BE2, 미션 ②~④)
--    status       pending(이름 검색 교환, 상대 확인 전) · confirmed. QR 교환은 바로 confirmed. 기존 행은 confirmed
--    confirmed_at 교환이 성립한 시각. 미션 판정은 이 시각으로 한다(기존 행은 created_at 으로 채움)
--    first_meet   오늘 처음 대화한 분인가요? 의 답(미션 ③). 내 행(scanner_id = 나)에만 쓴다. null = 아직 안 물음 또는 건너뜀
--    first_meet_at 위 답을 고른 시각
--    note         한 줄 남기기(100자). 계산에 쓰지 않는다
--    via          스캐너를 연 탭(card 명함 탭 · event 이벤트 탭). 판정과 무관하고 콘솔의 탭 불일치 수에만 쓴다
-- 3. edges 뷰는 confirmed 만 센다(칸 모양은 그대로)
-- 4. rec_impressions: 오늘 만나면 좋을 분(H-04)에 처음 보인 시각. 사람 쌍마다 한 행이고 다시 보여도 시각을 바꾸지 않는다.
--    미션 ② 판정(교환 성립 전에 내 목록에 뜬 적 있는 사람)과 행사 뒤 분석에 쓴다
-- 미션 상태는 뷰 대신 웹 서버(lib/missions.ts)가 계산한다. 마감 시각(ops_state mission_closed_at) 뒤의 기록을 빼야 해서다

alter table participants add column consent_refused_at timestamptz;

alter table card_exchanges
  add column status        text not null default 'confirmed' check (status in ('pending','confirmed')),
  add column confirmed_at  timestamptz,
  add column first_meet    boolean,
  add column first_meet_at timestamptz,
  add column note          text check (char_length(note) <= 100),
  add column via           text check (via in ('card','event'));
update card_exchanges set confirmed_at = created_at where confirmed_at is null and status = 'confirmed';

create or replace view edges as
select least(scanner_id, scanned_id) as a,
       greatest(scanner_id, scanned_id) as b,
       'exchange'::text as kind,
       0.3::real as weight,
       min(created_at) as first_at
from card_exchanges
where status = 'confirmed'
group by 1, 2;

create table rec_impressions (
  participant_id  uuid not null references participants(id) on delete cascade,
  target_id       uuid not null references participants(id) on delete cascade,
  version         int references assign_versions(version) on delete set null,
  first_shown_at  timestamptz not null default now(),
  primary key (participant_id, target_id)
);
create index on rec_impressions (target_id);
alter table rec_impressions enable row level security;   -- 0002 와 같다. 정책 없음 = 브라우저 접근 전부 거부
