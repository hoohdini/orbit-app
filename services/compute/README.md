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
| `recs.py` | 커피챗 개인 추천(정확 10 + 탐색 2, 이미 만난 사람 제외, 노출 상한), 이유 칩, 테이블 라벨과 대화거리 |

시험은 `python tests/test_pipeline.py` (pytest 가 있으면 `python -m pytest tests -q`). 모델 없이 가짜 벡터 70명으로 돈다.

실제 모델로 한 바퀴는 `python sim/run_sim.py`. 가상 70명(템플릿 문장)으로 발급 → 테이블토크 → 명함 교환(합성) → 만남 반영 → 커피챗 → 추천까지 돈다. 맥 CPU 기준 모델 로드 9초, 임베딩 0.4초, 코드북 0.05초, 배정 라운드당 0.3초, 제약 위반 0. 주소 충돌 43~47% 는 템플릿 문장이 서로 비슷해서 생긴 것이다(연명부 시험의 49명 같은 문장과 같은 원인).

### 06_event_loop.py 와 다른 점

연구 저장소의 대리 확인 결과(docs/31 · docs/33, 노션 9/23 백엔드 구현 결정)를 따라 바꿨다. 회의에서 다르게 정하면 설정값만 바꾸면 된다.

| 항목 | 원본 | 여기 | 근거 |
|---|---|---|---|
| 접두사 | passage: | query: (`EMBED_PREFIX`) | e5 설명서상 대칭 비교는 양쪽 query:. 한 방향 점수에서 passage: 가 나은지는 아직 비교 안 함 |
| 점수용 벡터의 평균 제거 | 함 | 안 함 | 평균을 빼면 정확도 0.78 → 0.70. 주소용 코드북에서만 출처별 평균을 뺀다 |
| 문장 여러 개 | 한 문장으로 임베딩 | 항목마다 벡터 → 평균 | 짧은 항목 10개 0.73 대 긴 글 1개 0.57, 평균이 최댓값보다 나음 |
| 개인 추천 점수 | min(양방향) | 한 방향 a | 리허설 정답이 한 사람의 답. 사람별 비교에서 a 0.713 · min 0.694 |
| 테이블 배정 점수 | min | min 기본, avg · harmonic 선택 | 리허설에서 셋을 비교. pair_scores 에 두 방향 원본을 남긴다 |
| 담금질 | 매번 전체 재계산 | 증분 계산 | 결과는 같고(시험으로 확인) 속도만 다름 |
| 무작위 자리 | 없음 | `random_ratio` (기본 0) | 리허설 정확도가 0.65 미만이면 15~40% 가 이득 |

## 진입점

| 경로 | 언제 | 하는 일 |
|---|---|---|
| GET /health | 항상 | 생존 신호. 운영 콘솔이 `ops_state.compute_heartbeat` 로 기록한다 |
| POST /precompute | 행사 전날 | 발급과 테이블토크 배정 draft |
| POST /coffeechat | 테이블토크 종료 뒤 | 점수 재계산, 커피챗 배정 draft, 추천 |

헤더 `X-Compute-Secret` 이 `.env` 의 `COMPUTE_SECRET` 과 같아야 한다.

## 호스팅

1순위 Oracle Cloud Always Free ARM, 2순위 Hugging Face Spaces 도커. 예비는 운영자 노트북에서 같은 이미지 + Cloudflare Tunnel. 세 가지 중 어느 것도 리허설 1 전에 한 번은 실제로 띄운다.
