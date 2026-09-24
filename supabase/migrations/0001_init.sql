-- orbit-app 스키마 v0 (2026-09-25)
-- 정본은 이 파일이다. 설명은 docs/SCHEMA.md 에 있다.
-- Supabase 대시보드 SQL Editor 에 그대로 붙여 넣어 실행한다.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- 1. 참가자와 프로필 (행사 전 사전 등록 데이터로 적재)
-- ---------------------------------------------------------------

create table participants (
  id              uuid primary key default gen_random_uuid(),
  event_id        text not null default 'dev',
  display_name    text not null,                       -- 표시 이름. 동명이인 가능하므로 식별은 id 로만 한다
  affiliation     text,                                -- 소속(학교·회사)
  role            text not null check (role in ('student','alumni','professor','staff','other')),
  cohort          smallint,                            -- 기수 또는 졸업년도
  is_host         boolean not null default false,      -- 교수·알럼나이 등 주러 온 사람. 점수는 단방향
  is_admin        boolean not null default false,      -- 운영 콘솔 접근
  login_pin_hash  text not null,                       -- 간단 비밀번호 해시(bcrypt). 사전 구축 때 설정
  entry_token     text not null unique,                -- 입장 QR 에 담는 토큰
  visibility      text not null default 'scanned' check (visibility in ('all','scanned')),
  consent_at      timestamptz,                         -- 개인정보 동의 시각(온보딩)
  created_at      timestamptz not null default now()
);
create index on participants (event_id, display_name);

create table profiles (
  participant_id  uuid primary key references participants(id) on delete cascade,
  offer_text      text not null default '',            -- 지금 하는 일 (이름은 회의에서 확정 전. have/want 로 바꿀 수 있음)
  seek_text       text not null default '',            -- 오늘 찾는 사람
  topic_tags      text[] not null default '{}',        -- 주제 태그. 임베딩 문장에 들어간다
  intent_tags     text[] not null default '{}',        -- 관계 종류 태그. 점수 감점에 쓴다
  links           jsonb not null default '{}',         -- linkedin, portfolio 등. 명함에만 노출
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 2. 주소(SID)와 벡터. 계산 서비스만 쓴다. 행사 당일 재발급하지 않는다
-- ---------------------------------------------------------------

create table sids (
  participant_id    uuid primary key references participants(id) on delete cascade,
  offer_sid         smallint[] not null,               -- 예: {3,1,5}
  seek_sid          smallint[] not null,
  offer_vec         real[] not null,                   -- 384차원
  seek_vec          real[] not null,
  codebook_version  text not null,
  is_temp           boolean not null default false,    -- 태그 룰 임시 발급이면 true
  issued_at         timestamptz not null default now()
);

create table labels (                                  -- 주소 앞자리에 붙이는 사람이 읽는 이름
  codebook_version  text not null,
  prefix            smallint[] not null,               -- {3} 또는 {3,1}
  label             text not null,
  primary key (codebook_version, prefix)
);

-- ---------------------------------------------------------------
-- 3. 체크인
-- ---------------------------------------------------------------

create table checkins (
  participant_id  uuid primary key references participants(id) on delete cascade,
  checked_at      timestamptz not null default now(),
  is_late         boolean not null default false,
  by_admin        uuid references participants(id)
);

-- ---------------------------------------------------------------
-- 4. 테이블 배정 (버전 단위). 운영자가 publish 해야 참가자에게 보인다
-- ---------------------------------------------------------------

create table assign_versions (
  version       serial primary key,
  round         text not null check (round in ('tabletalk','coffeechat')),
  status        text not null default 'draft' check (status in ('draft','published','retired')),
  params        jsonb not null default '{}',           -- 점수 방식, 응답률, 대체 경로 여부 등
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

create table tables_meta (                             -- 테이블별 라벨과 대화거리
  version       int not null references assign_versions(version) on delete cascade,
  table_no      smallint not null,
  label         text,                                  -- 공통 관심사 라벨
  talk_prompts  text[] not null default '{}',          -- 대화거리
  primary key (version, table_no)
);

create table table_members (
  version         int not null references assign_versions(version) on delete cascade,
  table_no        smallint not null,
  participant_id  uuid not null references participants(id) on delete cascade,
  primary key (version, participant_id)
);
create index on table_members (version, table_no);

create table pair_scores (                             -- 배정에 쓴 쌍 점수를 그대로 보관 (나중에 정확도 채점용)
  version         int not null references assign_versions(version) on delete cascade,
  a               uuid not null references participants(id) on delete cascade,
  b               uuid not null references participants(id) on delete cascade,
  score           real not null,                       -- 배정에 쓴 최종 점수 (min 또는 조화평균)
  score_ab        real,                                -- a 의 seek 와 b 의 offer
  score_ba        real,
  primary key (version, a, b)
);

create table recs (                                    -- 커피챗 개인 추천 목록
  version         int not null references assign_versions(version) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  rank            smallint not null,
  target_id       uuid not null references participants(id) on delete cascade,
  kind            text not null default 'exact' check (kind in ('exact','explore')),
  reason          jsonb not null default '{}',         -- 사실 기반 이유 칩 (공통 태그, 앞자리 일치)
  primary key (version, participant_id, rank)
);

-- ---------------------------------------------------------------
-- 5. 상호작용 기록 (패시브 수집). 간선은 계산 서비스가 여기서 만든다
-- ---------------------------------------------------------------

create table card_exchanges (                          -- 명함 QR 스캔. 방향 있음(스캔한 사람 → 스캔당한 사람)
  id            bigserial primary key,
  scanner_id    uuid not null references participants(id) on delete cascade,
  scanned_id    uuid not null references participants(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (scanner_id, scanned_id),
  check (scanner_id <> scanned_id)
);
create index on card_exchanges (scanned_id);

create table satisfaction (                            -- 테이블토크 끝 만족도 팝업 (1~5)
  id              bigserial primary key,
  participant_id  uuid not null references participants(id) on delete cascade,
  round           text not null check (round in ('tabletalk','coffeechat')),
  score           smallint not null check (score between 1 and 5),
  comment         text,
  created_at      timestamptz not null default now(),
  unique (participant_id, round)
);

create table event_log (                               -- 화면 이벤트 로그. 어떤 화면을 언제 열었나
  id              bigserial primary key,
  participant_id  uuid references participants(id) on delete set null,
  kind            text not null,                       -- 예: open_home, open_coffeechat, scan_fail
  payload         jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index on event_log (participant_id, created_at);

-- ---------------------------------------------------------------
-- 6. 포스터세션 (QR → 퀴즈 → 스탬프 → 응모권)
-- ---------------------------------------------------------------

create table posters (
  id          serial primary key,
  code        text not null unique,                    -- 포스터 QR 에 담는 코드
  title       text not null,
  presenter   text,
  tags        text[] not null default '{}',
  booth       text
);

create table poster_quizzes (                          -- 정답은 서버에서만 본다. API 응답에 answer_index 를 넣지 않는다
  id            serial primary key,
  poster_id     int not null references posters(id) on delete cascade,
  question      text not null,
  choices       jsonb not null,                        -- ["보기1","보기2","보기3","보기4"]
  answer_index  smallint not null
);

create table quiz_attempts (
  id              bigserial primary key,
  participant_id  uuid not null references participants(id) on delete cascade,
  poster_id       int not null references posters(id) on delete cascade,
  choice_index    smallint not null,
  is_correct      boolean not null,
  created_at      timestamptz not null default now()
);

create table stamps (
  participant_id  uuid not null references participants(id) on delete cascade,
  poster_id       int not null references posters(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (participant_id, poster_id)
);

create table poster_interest (                         -- 퀴즈 뒤 관심도 (1~5)
  participant_id  uuid not null references participants(id) on delete cascade,
  poster_id       int not null references posters(id) on delete cascade,
  score           smallint not null check (score between 1 and 5),
  created_at      timestamptz not null default now(),
  primary key (participant_id, poster_id)
);

create table raffle_tickets (
  id              bigserial primary key,
  participant_id  uuid not null references participants(id) on delete cascade,
  reason          text not null,                       -- 예: stamps_5
  issued_at       timestamptz not null default now(),
  unique (participant_id, reason)
);

-- ---------------------------------------------------------------
-- 7. 운영 상태와 챗봇 로그
-- ---------------------------------------------------------------

create table ops_state (                               -- key: published_tabletalk, published_coffeechat, compute_heartbeat, phase
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table chat_logs (                               -- P2. 횟수 제한용
  id              bigserial primary key,
  participant_id  uuid references participants(id) on delete set null,
  question        text not null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 8. 뷰. 계산 서비스와 화면이 공통으로 쓰는 읽기 전용 모양
-- ---------------------------------------------------------------

-- 무방향 간선. 명함 교환은 0.3, 같은 테이블은 간선이 아니다(금지 쌍으로만 쓴다)
create view edges as
select least(scanner_id, scanned_id) as a,
       greatest(scanner_id, scanned_id) as b,
       'exchange'::text as kind,
       0.3::real as weight,
       min(created_at) as first_at
from card_exchanges
group by 1, 2;

-- 현재 공개된 테이블 배정 (라운드별 최신 published 버전)
create view current_tables as
select v.round, m.version, m.table_no, m.participant_id, t.label
from assign_versions v
join table_members m on m.version = v.version
left join tables_meta t on t.version = m.version and t.table_no = m.table_no
where v.status = 'published'
  and v.version = (select max(version) from assign_versions x where x.round = v.round and x.status = 'published');
