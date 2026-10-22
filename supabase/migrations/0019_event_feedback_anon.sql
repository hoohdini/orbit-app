-- 2026-10-22. 이용 동의(개인정보 수집 및 이용)를 거부한 사람의 행사 후기를 사람과 잇지 않고 저장한다. 0018 다음에 실행한다.
-- 10/22 민찬 결정: 거부자도 후기는 받는다. 수집을 거부했으므로 participant_id 를 두지 않고 스탬프도 찍지 않는다(미션 판정 lib/missions.ts 는 이 표를 읽지 않는다).
-- 사람을 알 수 없으므로 다시 내면 새 행이 하나 더 생긴다(덮어쓰지 않음). 질문 · 값은 event_feedback(0018)과 같다.
-- source 는 어디서 온 후기인지 표시한다. 지금은 consent_refused(동의 거부자) 하나뿐이다.
create table event_feedback_anon (
  id          uuid primary key default gen_random_uuid(),
  source      text not null default 'consent_refused' check (source in ('consent_refused')),
  rating      smallint not null check (rating between 1 and 3),
  tags        text[] not null default '{}',
  comment     text check (comment is null or char_length(comment) <= 100),
  created_at  timestamptz not null default now()
);
alter table event_feedback_anon enable row level security;   -- 0002 와 같다. 정책 없음 = 브라우저 접근 전부 거부
