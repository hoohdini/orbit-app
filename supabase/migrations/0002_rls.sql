-- 접근 통제 (2026-09-25)
-- 원칙: 브라우저는 DB 를 직접 부르지 않는다. 모든 접근은 Next.js API Route 가 service_role 키로 한다.
-- 따라서 anon·authenticated 역할에는 정책을 하나도 주지 않는다. RLS 를 켜기만 하면 전부 거부된다.
-- service_role 은 RLS 를 우회한다. 이 키는 서버 환경변수에만 둔다.

alter table participants     enable row level security;
alter table profiles         enable row level security;
alter table sids             enable row level security;
alter table labels           enable row level security;
alter table checkins         enable row level security;
alter table assign_versions  enable row level security;
alter table tables_meta      enable row level security;
alter table table_members    enable row level security;
alter table pair_scores      enable row level security;
alter table recs             enable row level security;
alter table card_exchanges   enable row level security;
alter table satisfaction     enable row level security;
alter table event_log        enable row level security;
alter table posters          enable row level security;
alter table poster_quizzes   enable row level security;
alter table quiz_attempts    enable row level security;
alter table stamps           enable row level security;
alter table poster_interest  enable row level security;
alter table raffle_tickets   enable row level security;
alter table ops_state        enable row level security;
alter table chat_logs        enable row level security;

-- anon 키가 새어도 읽을 수 있는 것이 없도록 뷰도 막는다
revoke all on edges from anon, authenticated;
revoke all on current_tables from anon, authenticated;

-- 나중에 Supabase Realtime 을 쓰기로 하면, 그때 커스텀 JWT 와 select 정책을 여기에 추가한다.
