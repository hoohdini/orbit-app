-- 2026-09-25. 비밀번호는 참가자가 첫 로그인 때 스스로 정한다. 그 전에는 null 이다.
-- 입장 QR 은 공용 링크라 개인별 토큰은 필수가 아니다.
alter table participants alter column login_pin_hash drop not null;
alter table participants alter column entry_token drop not null;
