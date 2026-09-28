# services/compute

Python FastAPI 계산 서비스다. 임베딩(multilingual-e5-small), 코드북 주소 발급, 테이블 배정, 커피챗 추천을 맡는다. 상태는 갖지 않고 결과는 Supabase 에 버전을 붙여 쓴다. 담당은 민찬이다.

## 로컬 실행

```bash
cd services/compute
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env          # 값 채우기
uvicorn main:app --reload --port 8000
```

`http://localhost:8000/health` 가 열리면 된다. Windows 에서 anaconda 와 torch 가 충돌하면 `set KMP_DUPLICATE_LIB_OK=TRUE`.

## 알고리즘 (`pipeline/`)

연구 저장소 `26-2_Modeling_RecSys/event_demo/06_event_loop.py` 의 발급 · 배정 · 추천을 옮겼다. DB 입출력 없이 배열만 받고 돌려준다.

| 파일 | 하는 일 |
|---|---|
| `embed.py` | 문장 → 벡터. 자유 문장을 항목으로 나눠 항목마다 벡터를 만들고 평균 |
| `codebook.py` | 공유 코드북(출처별 평균 제거), 주소 발급, 고정 코드북에 늦게 온 사람 붙이기, 구분 번호 |
| `scoring.py` | 한 방향 점수 a, 테이블용 결합(min · 평균 · 조화평균), 호스트 단방향, 만남 반영(G★ 주입) |
| `seating.py` | 호스트 먼저 → 한 명씩 → 담금질. 바뀐 두 테이블만 다시 세는 증분 계산으로 70명 2만 번 0.3초(원본 38초) |
| `recs.py` | 커피챗 개인 추천(정확 10 + 탐색 2, 이미 만난 사람 제외, 노출 상한), 이유 칩, 테이블 대화거리 (테이블 이름표는 달지 않음) |

시험은 `python tests/test_pipeline.py` (pytest 가 있으면 `python -m pytest tests -q`). 모델 없이 가짜 벡터 70명으로 돈다.

실제 모델로 한 바퀴는 `python sim/run_sim.py`. 가상 70명(템플릿 문장)으로 발급 → 테이블토크 → 명함 교환(합성) → 만남 반영 → 커피챗 → 추천까지 돈다. 맥 CPU 기준 모델 로드 9초, 임베딩 0.4초, 코드북 0.05초, 배정 라운드당 0.3초, 제약 위반 0. 주소 충돌 43~47% 는 템플릿 문장이 서로 비슷해서 생긴 것이다(연명부 시험의 49명 같은 문장과 같은 원인).

### 06_event_loop.py 와 다른 점

연구 저장소의 대리 확인 결과(docs/31 · docs/33, 노션 9/23 백엔드 구현 결정)를 따라 바꿨다. 회의에서 다르게 정하면 설정값만 바꾸면 된다.

| 항목 | 원본 | 여기 | 근거 |
|---|---|---|---|
| 접두사 | passage: | query: (`EMBED_PREFIX`) | e5 설명서상 대칭 비교는 양쪽 query:. 한 방향 점수에서 passage: 가 나은지는 아직 비교 안 함 |
| 점수용 벡터의 평균 제거 | 함 | 안 함 | 평균을 빼면 정확도 0.78 → 0.70. 주소용 코드북에서만 출처별 평균을 뺀다 |
| 문장 여러 개 | 한 문장으로 임베딩 | 항목마다 벡터 → 평균 | 짧은 항목 10개 0.73 대 긴 글 1개 0.57, 평균이 최댓값보다 나음 |
| 개인 추천 점수 | min(양방향) | min 기본, `REC_SCORE=one_way` 로 한 방향 | 근거가 갈림(공동저술은 한 방향 0.713 · min 0.694, 스피드데이팅은 min 0.538 · 한 방향 0.528). 리허설에서 비교 후 결정 |
| 테이블 배정 점수 | min | min 기본, avg · harmonic 선택 | 리허설에서 셋을 비교. pair_scores 에 두 방향 원본을 남긴다 |
| 담금질 | 매번 전체 재계산 | 증분 계산 | 결과는 같고(시험으로 확인) 속도만 다름 |
| 무작위 자리 | 없음 | `random_ratio` (기본 0) | 리허설 정확도가 0.65 미만이면 15~40% 가 이득 |

## 구조

| 파일 | 하는 일 |
|---|---|
| `main.py` | 진입점(FastAPI). 비밀값 확인, 잘못된 상태는 409 |
| `service.py` | 두 작업의 흐름. precompute(발급 · 테이블토크 배정) · coffeechat(만남 반영 · 커피챗 배정 · 추천) |
| `repo.py` | DB 입출력. `SupabaseRepo`(실제) · `MemoryRepo`(DB 없이 시험). 칸 이름은 0001_init.sql 그대로 |
| `pipeline/` | 알고리즘 (아래 표) |
| `eval/rehearsal_accuracy.py` | 리허설 정확도. 사람별 정확도(누른 동석자 필요) · 만족도 선택지로 가른 구분 정확도(보조) |
| `sim/` | 가상 참가자 CSV 만들기 · 실제 모델로 한 바퀴 |
| `tests/` | `test_pipeline` 12개 · `test_service` 4개(한 바퀴 · 다른 행사 섞임 · 대체 경로 · 오류) · `test_main` 2개(비밀값 · 409) · `test_eval` 2개 |

## 행사 흐름과 호출

```
행사 전날      POST /precompute {}                      새 코드북 · 전원 주소 · 첫자리 묶음 이름표 초안(운영진 검수) · 테이블토크 배정 초안
체크인 마감    POST /precompute {"reuse_codebook": true}  저장된 코드북에 현장 등록자만 붙이고, 체크인한 사람으로 배정을 다시 냄
               운영 콘솔에서 공개
테이블토크 뒤   POST /coffeechat {}                       명함 교환 · 만족도 · 포스터 관심도 반영 · 테이블토크 동석자 금지 · 커피챗 배정 초안 · 개인 추천
(포스터세션 중)                                           포스터 관심도는 부르는 시점까지 들어온 답만 쓴다. 끝 무렵에 부를수록 많이 반영된다
```

- 운영진(role=staff)도 참가자와 똑같이 주소 · 배정 · 추천에 넣는다. 설문을 비워 두면 점수가 0 이라 사실상 아무 자리에나 앉는다
- 코드북은 `codebooks` 표에 저장하고 행사마다 활성 하나를 둔다(0007). 주소는 다시 학습하지 않는다
- 만족도 반영(질문 하나, 답별 가중치 `SAT_WEIGHTS`, 9/29 C안): 새로 얻은 게 있었다 1.0 · 조금 달랐다 0.33 · 잘 모르겠다 0 · 안 맞았다 −0.2.
  답한 사람의 Seek 를 그 테이블 사람들의 Offer 쪽으로 beta × 가중치만큼 옮긴다(음수면 밀어낸다) → 커피챗 추천에 그 사람들과 비슷한 새 사람이 더 올라온다.
  근거: 0.33 은 지수 gain(Järvelin & Kekäläinen 2002), −0.2 는 Rocchio 부정/긍정 비율 0.15/0.75(Manning 외 2008), 모름 = 결측(Krosnick 외 2002).
  조사 전문은 연구 저장소 docs/34. 명함 교환은 지금처럼 Offer 쪽(inject)
- 포스터 관심도 반영(`POSTER_WEIGHTS`, 임시값): 더 알아보고 싶다 1.0 · 흥미로웠다 0.5 · 내 관심 분야는 아니다 0.
  관심 있게 본 포스터(제목 + 주제 태그 벡터)의 가중 평균 쪽으로 Seek 를 beta × 가장 큰 가중치만큼 옮긴다 → 그 주제 사람이 더 추천된다.
  만족도 응답률과 상관없이 답한 사람마다 반영한다
- 가중치는 둘 다 데이터로 정한 값이 아니다(대리 자료에 이런 답이 없음). 리허설에서 답과 이후 반응을 저장해 정한다
- 배정 이유: 두 라운드 모두 `table_members.reason` 에 사람별로 남긴다(테이블, 무작위 자리 여부, 가장 잘 맞는 사람과 점수, 테이블 평균,
  커피챗이면 이전 테이블 · 만족도 · 명함을 교환한 상대 수 · 반영한 관심 포스터 수, 한 줄 설명 text). 운영진 대시보드용이고 참가자 화면에는 안 보낸다
- 만족도 응답률이 `min_response_rate`(기본 0.5) 미만이면 만남 반영 없이 텍스트 점수로만 커피챗을 낸다(대체 경로)
- 요청 본문 선택값: `table_mode`(min · avg · harmonic) · `random_ratio` · `rec_mode`(없으면 `REC_SCORE`) · `beta`
- 코드북 버전 이름은 `cb-<행사>-<날짜시각>`. 배정 버전에 행사 번호(`assign_versions.event_id`)를 남겨 개발 DB 에 행사가 여러 개 섞여도 서로 집지 않는다(0007)
- 실제 개발 DB 한 바퀴(9/26): 가상 68명(sim-minchan) · 전날 2.1초 · 체크인 마감 1.3초 · 커피챗 1.2초 · 재회 0 · 공개 안 함 · dev 공개 배정 영향 없음
- 시험 데이터 정리: `python sim/cleanup_event.py sim-minchan` (세기만) → `--yes` (지우기). dev 는 지우지 못하게 막아 둠
- 한 바퀴 확인: `python sim/make_fake_csv.py sim/fake_70.csv` 다음 `python sim/run_service_sim.py sim/fake_70.csv`
  (맥 CPU, 모델 로드 9초 · 전날 0.9초 · 체크인 마감 0.6초 · 커피챗 0.3초 · 제약 위반 0)

## 진입점

| 경로 | 언제 | 하는 일 |
|---|---|---|
| GET /health | 항상 | 생존 신호. 운영 콘솔이 `ops_state.compute_heartbeat` 로 기록한다 |
| POST /precompute | 행사 전날 | 발급과 테이블토크 배정 draft |
| POST /coffeechat | 테이블토크 종료 뒤 | 점수 재계산, 커피챗 배정 draft, 추천 |

헤더 `X-Compute-Secret` 이 `.env` 의 `COMPUTE_SECRET` 과 같아야 한다.

## 호스팅

1순위 Oracle Cloud Always Free ARM, 2순위 Hugging Face Spaces 도커. 예비는 운영자 노트북에서 같은 이미지 + Cloudflare Tunnel. 세 가지 중 어느 것도 리허설 1 전에 한 번은 실제로 띄운다.
