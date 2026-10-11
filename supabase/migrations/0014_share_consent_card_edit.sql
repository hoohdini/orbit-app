-- 2026-10-11. 피그마 마이페이지 · 이벤트 미션 연결(성하). 0013 다음에 실행한다.
-- 1. 동의를 두 항목으로 나눈다(피그마 마이페이지 내 정보, 10/11 성하 결정).
--    개인정보 수집 및 이용 = 지금의 consent_at · consent_refused_at(행사 중 기록: 명함 교환 · 만족도 · 포스터 응답 · 퀴즈)
--    명함 공개 및 추천 활용 = share_consent_at · share_refused_at(새 칸). 거부하면 다른 사람의 추천 · 이름 검색 · 궤도에서 빠지고 명함 교환을 주고받지 않는다
--    온보딩의 동의합니다 · 동의하지 않습니다는 두 항목을 같이 정한다. 마이페이지에서 항목별로 바꾼다.
--    이미 고른 사람은 같은 답으로 채운다(아직 실제 행사 데이터 없음)
-- 2. profiles.card_edit: 마이페이지에서 고친 명함 내용(offer_text · seek_text · topic_tags). 명함에만 보이고 계산(추천 · 배정)에는 쓰지 않는다
--    (피그마 안내: 수정결과는 명함에만 반영되고, 오늘의 추천에는 반영되지 않습니다). null 이면 사전 등록 내용 그대로
alter table participants
  add column share_consent_at timestamptz,
  add column share_refused_at timestamptz;
update participants set share_consent_at = consent_at where consent_at is not null and share_consent_at is null;
update participants set share_refused_at = consent_refused_at where consent_refused_at is not null and share_refused_at is null;

alter table profiles add column card_edit jsonb;
