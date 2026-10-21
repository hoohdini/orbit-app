-- 행사 포스터 목록 (scripts/build_posters.py 가 scripts/event_posters.json 으로 만든다. 직접 고치지 않는다)
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 실행한다. 여러 번 실행해도 결과가 같다.
-- 코드 = 행사장 자리 번호. 퀴즈는 저장소 밖 poster_quizzes.sql 을 이 파일 다음에 실행한다.
-- presenter_ids(발표자 본인 응답을 커피챗 계산에서 뺌, docs/DATA_SPEC.md P-03)는 participants.event_id = 'orbit-2026' 에서 이름으로 찾는다.
-- 명단 적재 전에 실행하면 빈 배열이므로 적재 뒤 한 번 더 실행한다.

begin;

-- 예전 행(개발용 seed 가짜 포스터, 자리 번호 전 번호). 코드와 제목이 둘 다 맞을 때만 지운다. 딸린 퀴즈 · 기록도 같이 지워진다
delete from posters where (code, title) in (
  ('P01', '그래프 SID 생성형 추천'),
  ('P02', '구인구직 매칭 데이터셋'),
  ('P03', '시계열 이상탐지'),
  ('P04', 'LLM 기반 문서 요약'),
  ('P05', '인과추론으로 본 마케팅 효과'),
  ('P01', '그래프 Semantic ID로 생성형 추천의 콜드스타트 완화'),
  ('P02', 'Do MLLMs Capture How Interfaces Guide User Behavior?'),
  ('P03', 'Semi-Supervised Preference Optimization with Limited Feedback'),
  ('P04', '사주명리학의 유의성에 대한 통계적 접근')
);

-- booth 도 늘 덮어쓴다(JSON 에 booth 가 없으면 null). 예전 seed 의 부스 값(A1 · B2)이 남지 않게(10/21 민찬)
insert into posters (code, title, presenter, tags, booth, summary) values
  ('P01', 'Do MLLMs Capture How Interfaces Guide User Behavior? A Benchmark for Multimodal UI/UX Design Understanding', '전재현', array['멀티모달 LLM','UI/UX','벤치마크']::text[], null, 'UI 디자인의 목표는 사용자를 원하는 행동으로 이끄는 거예요.
실제 서비스의 UI 디자인 300쌍으로, 멀티모달 LLM이 어느 디자인이 더 효과적인지 고르고 그 이유까지 설명할 수 있는지 평가하는 벤치마크(WiserUI-Bench)를 만들었어요.
ACL 2026 Main'),
  ('P02', 'Quantum Eigensolvers for Quantum Simulation and Optimization', '임창재', array['양자컴퓨팅','최적화','양자 시뮬레이션']::text[], null, '양자 시스템의 에너지와 고윳값을 탐색하는 Quantum Eigensolvers의 기본 원리를 소개하고, 양자 시뮬레이션부터 고전 컴퓨터로 풀기 어려운 최적화 문제까지의 응용 가능성을 살펴봐요.'),
  ('P03', 'Recovering RLVR from Failing Spurious Rewards with Subspace Regularization', '신재우', array['강화학습','LLM 학습','RLVR']::text[], null, 'RLVR 학습에서 실제 성능 향상과 무관한 잘못된 보상(Spurious Reward)으로 인해 모델 성능이 떨어지는 현상을 분석하고, Subspace Regularization으로 이를 완화해 성능을 회복하는 방법을 연구해요.'),
  ('P04', 'Semi-Supervised Preference Optimization with Limited Feedback', '이성균', array['LLM 정렬','선호 최적화','준지도학습']::text[], null, '사람이 직접 짝지어 매긴 선호 데이터는 비싸요(건당 5~10분, 10~30달러).
SSPO는 적은 양의 짝 데이터에 다른 데이터를 함께 써서, 훨씬 적은 사람 피드백으로 LLM을 정렬하는 방법이에요.
ICLR 2026 Oral'),
  ('P05', 'Can Offline RL Stabilize Generative Quantum Eigensolvers?', '배연욱', array['양자컴퓨팅','강화학습','분자 시뮬레이션']::text[], null, '분자의 바닥 상태를 계산하는 생성형 양자 고윳값 솔버(ADAPT-GQE)의 GRPO 사후 학습에서 생기는 불안정성을, 오프라인 가치 기반 강화학습으로 개선할 수 있는지 실험으로 분석해요.'),
  ('P06', '사주명리학의 유의성에 대한 통계적 접근', '구기현', array['가설검정','통계','사주']::text[], null, '점성술 검증 연구의 ''우연 수준과 비교'' 설계를 사주에 적용해 두 질문을 검정했어요.
① 성향 설문 응답만으로 생일을 우연보다 잘 찾아낼 수 있을까?
② DSL 학회원 80명 중 금(金) 기운이 강한 사람이 자연 출생 비율보다 많을까?'),
  ('P07', 'Is Attention Explainable?', '26-1 NLP팀', array['자연어처리','설명가능 AI','Attention']::text[], null, '문장 순서 예측 모델에서 Attention과 Gradient 중 어느 쪽이 예측 근거를 더 잘 설명하는지, LLM과 사람이 고른 근거 단어를 기준으로 비교·검증한 연구예요.
DSL 26-1 NLP팀 모델링 프로젝트'),
  ('P08', 'LLM 기반 금융 QA 평가 프레임워크 구축', '26-1 BC카드 1팀', array['금융·핀테크','LLM 평가','질의응답']::text[], null, '금융 도메인에 특화된 LLM의 질의응답 성능을 평가하기 위해 데이터셋과 자동 평가 파이프라인을 구축하고, 여러 모델의 성능을 비교·분석한 연구예요.
DSL 26-1 BC카드 기업 연계 프로젝트'),
  ('P09', '카드상품 정보 등록 검수 시스템 구축', '26-1 BC카드 2팀', array['금융·핀테크','데이터 품질','자동 검수']::text[], null, '카드상품 정보를 등록할 때 생기는 오류를 자동으로 찾아내 데이터 정확성을 높이고 검수 업무의 효율을 개선하는 시스템을 개발한 프로젝트예요.
DSL 26-1 BC카드 기업 연계 프로젝트'),
  ('P10', 'ClearBooking: 호텔 실결제액·취소 위약금', '26-2 NLP팀', array['자연어처리','브라우저 확장','여행·숙박']::text[], null, '숙소 예약 때 가격, 취소 조건, 리뷰를 한 화면에서 비교하는 브라우저 확장 프로그램을 만들어, 실제 결제 금액과 취소 위약금을 확인하고 합리적으로 예약하도록 돕는 프로젝트예요.
DSL 26-2 NLP팀 모델링 프로젝트'),
  ('P11', '그래프 Semantic ID로 생성형 추천의 콜드스타트 완화', '26-2 추천시스템팀', array['추천시스템','생성형 추천','그래프']::text[], null, '생성형 추천(TIGER)은 상호작용이 적은 아이템을 잘 추천하지 못해요.
SID를 만들기 전 아이템 임베딩에 ''함께 구매·조회된 이웃'' 정보를 더해서, 추가 학습 없이 이 콜드스타트 문제를 줄일 수 있는지 실험했어요.
오늘 받은 명함의 SID도 같은 방식으로 발급했어요.
DSL 26-2 추천시스템팀 모델링 프로젝트')
on conflict (code) do update set
  title = excluded.title, presenter = excluded.presenter, tags = excluded.tags, booth = excluded.booth, summary = excluded.summary;

update posters set presenter_ids = coalesce((select array_agg(id) from participants where event_id = 'orbit-2026' and display_name = any(array['전재현']::text[])), '{}') where code = 'P01';
update posters set presenter_ids = coalesce((select array_agg(id) from participants where event_id = 'orbit-2026' and display_name = any(array['임창재']::text[])), '{}') where code = 'P02';
update posters set presenter_ids = coalesce((select array_agg(id) from participants where event_id = 'orbit-2026' and display_name = any(array['신재우']::text[])), '{}') where code = 'P03';
update posters set presenter_ids = coalesce((select array_agg(id) from participants where event_id = 'orbit-2026' and display_name = any(array['이성균']::text[])), '{}') where code = 'P04';
update posters set presenter_ids = coalesce((select array_agg(id) from participants where event_id = 'orbit-2026' and display_name = any(array['배연욱']::text[])), '{}') where code = 'P05';
update posters set presenter_ids = coalesce((select array_agg(id) from participants where event_id = 'orbit-2026' and display_name = any(array['구기현']::text[])), '{}') where code = 'P06';
update posters set presenter_ids = coalesce((select array_agg(id) from participants where event_id = 'orbit-2026' and display_name = any(array['구기현','권나연','어희정','조유빈']::text[])), '{}') where code = 'P07';
update posters set presenter_ids = coalesce((select array_agg(id) from participants where event_id = 'orbit-2026' and display_name = any(array['고서연','이채원','신태희','박현진','배연욱','안재민','이윤서']::text[])), '{}') where code = 'P08';
update posters set presenter_ids = coalesce((select array_agg(id) from participants where event_id = 'orbit-2026' and display_name = any(array['어희정','황진우','김건우','신동준','조재현','김정민','배소윤']::text[])), '{}') where code = 'P09';
update posters set presenter_ids = coalesce((select array_agg(id) from participants where event_id = 'orbit-2026' and display_name = any(array['이윤서','이은민','조윤상','배소윤']::text[])), '{}') where code = 'P10';
update posters set presenter_ids = coalesce((select array_agg(id) from participants where event_id = 'orbit-2026' and display_name = any(array['박성하','황수민','김나혜','김민찬','김현희']::text[])), '{}') where code = 'P11';

commit;

-- 확인: 목록 순서 = 자리 번호, 발표자 id 수
select code, title, presenter, cardinality(presenter_ids) as presenters, (select count(*) from poster_quizzes q where q.poster_id = posters.id) as quizzes
from posters order by code;
