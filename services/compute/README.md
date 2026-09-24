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

## 옮겨 올 코드

연구 저장소 `26-2_Modeling_RecSys/event_demo/06_event_loop.py` 의 `issue()`, `assign_tables()`, 추천 부분을 `pipeline/` 아래로 옮긴다. 담금질은 라운드당 38초라 증분 계산으로 줄인다. 테스트는 같은 저장소의 71명 시뮬레이션을 이 서비스 안에서 끝까지 돌리는 것으로 한다.

## 진입점

| 경로 | 언제 | 하는 일 |
|---|---|---|
| GET /health | 항상 | 생존 신호. 운영 콘솔이 `ops_state.compute_heartbeat` 로 기록한다 |
| POST /precompute | 행사 전날 | 발급과 테이블토크 배정 draft |
| POST /coffeechat | 테이블토크 종료 뒤 | 점수 재계산, 커피챗 배정 draft, 추천 |

헤더 `X-Compute-Secret` 이 `.env` 의 `COMPUTE_SECRET` 과 같아야 한다.

## 호스팅

1순위 Oracle Cloud Always Free ARM, 2순위 Hugging Face Spaces 도커. 예비는 운영자 노트북에서 같은 이미지 + Cloudflare Tunnel. 세 가지 중 어느 것도 리허설 1 전에 한 번은 실제로 띄운다.
