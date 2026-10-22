-- 2026-10-22. 피그마 이벤트·미션 탭의 행사 후기(미션 ④)를 저장한다. 0017 다음에 실행한다.
-- 질문: 행사는 어땠습니까?   👍👍 최고였다(3) · 👍 좋았다(2) · 👎 별로였다(1). 태그 여러 개와 한 줄 의견(100자)은 선택
-- 한 사람당 한 행. 다시 제출하면 덮어쓰고 updated_at 만 바꾼다.
-- created_at 이 처음 낸 시각이다. 미션 판정(lib/missions.ts)은 이 시각이 마감(mission_closed_at) 안일 때만 스탬프로 센다.
create table event_feedback (
  participant_id  uuid primary key references participants(id) on delete cascade,
  rating          smallint not null check (rating between 1 and 3),
  tags            text[] not null default '{}',
  comment         text check (comment is null or char_length(comment) <= 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table event_feedback enable row level security;   -- 0002 와 같다. 정책 없음 = 브라우저 접근 전부 거부
