-- 2026-09-26. 만족도와 포스터 관심도를 1~5 숫자 대신 문장 선택지로 받는다.
-- 숫자는 사람마다 기준이 달라 의미가 약하고, 잘 모르겠다 같은 답이 중간 점수로 섞인다. 선택지 이름을 그대로 저장한다.
-- 화면 문구는 apps/web/app/api/tabletalk/_choices.ts · apps/web/app/api/poster/_lib.ts 에 있다.
--   satisfaction.choice     gained 새로 얻은 게 있었다 · different 좋았지만 내 관심사와는 조금 달랐다 · unsure 잘 모르겠다 · mismatch 나와는 잘 안 맞았다
--   poster_interest.choice  learn_more 더 알아보고 싶다 · interesting 흥미로웠다 · not_mine 내 관심 분야는 아니다
-- 이미 쌓인 숫자 행(개발 DB 시험분)은 가까운 선택지로 옮긴 뒤 score 칸을 지운다.

alter table satisfaction add column choice text;
update satisfaction set choice = case when score >= 4 then 'gained' when score = 3 then 'unsure' else 'mismatch' end;
alter table satisfaction alter column choice set not null;
alter table satisfaction add constraint satisfaction_choice_check
  check (choice in ('gained','different','unsure','mismatch'));
alter table satisfaction drop column score;

alter table poster_interest add column choice text;
update poster_interest set choice = case when score >= 4 then 'learn_more' when score = 3 then 'interesting' else 'not_mine' end;
alter table poster_interest alter column choice set not null;
alter table poster_interest add constraint poster_interest_choice_check
  check (choice in ('learn_more','interesting','not_mine'));
alter table poster_interest drop column score;
