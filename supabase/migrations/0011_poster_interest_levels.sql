-- 2026-10-06. 포스터 응답을 관심 이유 4지선다에서 흥미 3단계로 바꾼다(민찬, 10/5 백엔드 회의 · 10/6 문구 확정). 0010 다음에 실행한다.
-- 질문: 오늘 이 분야와 관련된 분을 더 만나 보고 싶나요?
--   want      꼭 만나 보고 싶어요
--   maybe     기회가 되면 좋아요
--   not_mine  제 관심 분야는 아니에요   (계산 서비스가 그 포스터 주제 쪽에서 조금 밀어낸다)
-- 관심 이유 4지선다는 모두 긍정이라, 미션 ① 때문에 관심 없는 포스터를 찍어도 긍정 이유를 억지로 골라야 했다.
-- '잘 모르겠다' 칸은 두지 않는다. 부정으로 읽혀 관심 없음과 겹친다(10/5 팀 피드백).
-- 칸 이름 reason 은 그대로 둔다(API 입력 이름 · 계산 서비스가 이 이름으로 읽는다). 값만 바꾼다.
-- 예전 값(topic · method · experience · new_field)은 모두 긍정이었으므로 want 로 옮긴다(개발 DB 시험 응답만 해당).
-- shown_order 는 남긴다. 정도를 묻는 선택지라 이제 순서를 섞지 않으므로 늘 want, maybe, not_mine 이다.
--
-- 순서: 이 마이그레이션과 be/ 머지(웹 배포)를 같이 한다. 아직 실제 행사 데이터가 없어(개발 DB 시험 응답만) 둘 사이 잠깐의 간극은 문제되지 않는다.
--   0012 는 칸만 추가하므로 먼저 적용해도 된다.
alter table poster_responses drop constraint if exists poster_responses_reason_check;
update poster_responses set reason = 'want' where reason in ('topic', 'method', 'experience', 'new_field');
alter table poster_responses add constraint poster_responses_reason_check check (reason in ('want', 'maybe', 'not_mine'));
