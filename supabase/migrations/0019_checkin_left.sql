-- 2026-10-25. 일찍 나가는 사람 표시(10/25 민찬 결정). 0018 다음에 실행한다.
-- 커피챗 계산(행사 직후 추천 final 은 제외)은 left_at 이 있는 사람을 앉히지 않고 주도 선배로도 뽑지 않는다.
-- 늦게 온 사람 커피챗 자리(lib/coffeechatLate.ts)도 left_at 이 있으면 주지 않는다. 커피챗 공개 뒤에 나가면 공개된 자리는 그대로 둔다(빈자리).
-- left_at  나간다고 표시한 시각. null 이면 아직 행사장에 있다. 되돌리면(다시 참여) null 로 돌아간다
-- left_by  표시한 사람. null = 본인(참가자 화면의 일찍 나가요), 아니면 표시한 운영자의 참가자 id
-- RLS 는 0002 그대로다(checkins 는 정책 없음 = 브라우저 접근 전부 거부, 서버 service_role 만)
alter table checkins add column left_at timestamptz;
alter table checkins add column left_by uuid references participants(id) on delete set null;
