-- 2026-09-28. 배정마다 사람별 이유를 남긴다. 운영진 대시보드가 배정 상황과 바뀐 이유를 확인하는 데 쓴다(9/27 회의).
-- 계산 서비스만 쓴다. 참가자 화면 API 는 이 칸을 읽지 않는다.
-- 모양: { table_no, random, best_mate, best_score, avg_score, from_table?, satisfaction?, exchanges?, text }
--   text 예: 테이블토크 3번 → 5번. 가장 잘 맞는 사람 가상12(0.82), 테이블 평균 0.61. 만족도 '새로 얻은 게 있었다' 반영
alter table table_members add column reason jsonb;
