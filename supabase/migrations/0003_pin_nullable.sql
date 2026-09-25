-- 2026-09-25. 로그인 숫자는 사전 적재 때 넣지만, 워크인을 콘솔에서 먼저 추가하고 숫자를 나중에 줄 수 있게 null 을 허용한다. null 이면 로그인 불가.
-- 입장 QR 은 공용 링크라 개인별 토큰은 필수가 아니다.
alter table participants alter column login_pin_hash drop not null;
alter table participants alter column entry_token drop not null;
