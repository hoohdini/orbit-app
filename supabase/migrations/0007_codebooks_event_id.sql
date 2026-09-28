-- 2026-09-28. 두 가지를 정리한다(민찬 결정).
-- 1. 코드북 전용 표. 지금까지는 ops_state 의 codebook:<버전> · codebook_active:<행사> 에 넣었다.
--    코드북 = 주소(SID)를 정하는 기준표. 전날 학습하고 체크인 마감 때 현장 등록자를 같은 기준으로 붙이려고 저장한다.
-- 2. 배정 버전에 행사 번호(event_id). 개발 DB 처럼 행사가 섞이면 다른 행사의 배정을 집을 수 있었다.
--    current_tables 도 라운드 · 행사별 최신 published 로 바꾼다. 참가자는 한 행사에만 속하므로 화면 쪽 조회는 그대로 맞는다.

create table codebooks (
  version     text primary key,                         -- cb-<행사>-<날짜시각>. sids.codebook_version · labels.codebook_version 이 가리킨다
  event_id    text not null,
  mu_offer    real[] not null,                          -- 384차원. 주소 계산 전에 빼는 평균
  mu_seek     real[] not null,
  centers     jsonb not null,                           -- 층(3) x 칸(8) x 384 대표 지점
  active      boolean not null default false,           -- 행사마다 하나만 true
  created_at  timestamptz not null default now()
);
create unique index codebooks_one_active on codebooks (event_id) where active;
alter table codebooks enable row level security;       -- 0002 와 같다. 정책 없음 = 브라우저 접근 전부 거부

alter table assign_versions add column event_id text not null default 'dev';
-- 이미 있는 배정은 구성원이 속한 행사로 채운다(개발 DB 의 시험 행사 sim-minchan 등)
update assign_versions v set event_id = s.event_id
from (select m.version, min(p.event_id) as event_id
      from table_members m join participants p on p.id = m.participant_id
      group by m.version) s
where s.version = v.version;
create index on assign_versions (event_id, round, status);

-- 칸은 끝에만 붙일 수 있어서 event_id 를 맨 뒤에 둔다
create or replace view current_tables as
select v.round, m.version, m.table_no, m.participant_id, t.label, v.event_id
from assign_versions v
join table_members m on m.version = v.version
left join tables_meta t on t.version = m.version and t.table_no = m.table_no
where v.status = 'published'
  and v.version = (select max(version) from assign_versions x
                   where x.round = v.round and x.event_id = v.event_id and x.status = 'published');
