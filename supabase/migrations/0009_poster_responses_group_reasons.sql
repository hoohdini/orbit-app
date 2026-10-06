-- 2026-10-05. 개발 지시서 v0.2 E-02 · B-05 · B-07 · B-08 (민찬). 0008 다음에 실행한다.
-- 1. poster_responses: 포스터 관심 이유(미션 ①). poster_interest(퀴즈 뒤 관심도 3지선다)를 대신한다.
--    poster_interest 는 운영 콘솔 포스터 칸이 아직 읽으므로 지우지 않는다(새 응답은 여기에만 쌓인다)
--    reason      topic 주제가 흥미로움 · method 방법이 궁금함 · experience 내 경험과 관련 있음 · new_field 새롭게 접한 분야
--    shown_order 그 사람에게 보여 준 선택지 순서(사람마다 무작위). 첫 칸 쏠림을 나중에 보정하려고
--    latency_ms  마지막 스캔부터 제출까지(서버 시각). 5초 미만은 계산에서 버린다(B-05)
--    seq_no      그 사람의 몇 번째 포스터 응답인지(1부터). 같은 포스터 재응답은 번호를 바꾸지 않는다. 1 · 2 는 미션용으로 보고 가중치를 낮춘다
--    quiz_attempted 그 포스터 퀴즈를 풀어 봤는지. 응답 뒤에 풀어도 퀴즈 답 API 가 true 로 바꾼다
-- 2. posters: summary(요약 한 줄), presenter_ids(발표자 참가자 id). 포스터 벡터 = 제목 + 키워드(tags) + 요약. 발표자 본인 · 같은 소속 응답은 계산에서 뺀다
-- 3. group_reasons: 커피챗 그룹 구성원 카드의 근거 한 줄(B-07). 보는 사람(participant_id)마다 상대(target_id)별로 한 줄. 근거가 없으면 행이 없다
-- 4. tables_meta.orbit_prefix · orbit_label: 테이블 · 그룹 대표 라벨(B-08). 궤도 화면 전용이라 label 칸(화면에 나가는 칸)과 따로 둔다
--    orbit_prefix = 구성원 주소 첫자리 중 가장 많은 것(동률이면 null). 화면은 이 번호로 labels 의 최신 이름표를 다시 찾을 수 있다
-- 5. pair_scores.score_no_poster: 포스터 반영 없이 낸 점수. 리허설 · 행사 뒤 포스터 반영 효과를 비교한다(B-05 검증, B-13)

create table poster_responses (
  participant_id  uuid not null references participants(id) on delete cascade,
  poster_id       int not null references posters(id) on delete cascade,
  reason          text not null check (reason in ('topic','method','experience','new_field')),
  shown_order     text[] not null default '{}',
  latency_ms      int,
  seq_no          smallint not null check (seq_no > 0),
  quiz_attempted  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (participant_id, poster_id)
);
create index on poster_responses (poster_id);
alter table poster_responses enable row level security;   -- 0002 와 같다. 정책 없음 = 브라우저 접근 전부 거부

alter table posters
  add column summary       text,
  add column presenter_ids uuid[] not null default '{}';

create table group_reasons (
  version         int not null references assign_versions(version) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  target_id       uuid not null references participants(id) on delete cascade,
  kind            text not null check (kind in ('seek_offer','offer_seek','common_tags')),
  text            text not null,
  primary key (version, participant_id, target_id)
);
alter table group_reasons enable row level security;

alter table tables_meta
  add column orbit_prefix smallint,
  add column orbit_label  text;

alter table pair_scores add column score_no_poster real;
