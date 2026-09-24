"""orbit-app 계산 서비스 (뼈대, 2026-09-25).

하는 일은 둘뿐이다.
  /precompute  행사 전날. 사전 등록자 전원 임베딩 → 코드북 → 주소·라벨 발급 → 테이블토크 배정 draft
  /coffeechat  테이블토크 종료 뒤. 체크인 명단 + edges + satisfaction 으로 점수 재계산 → 커피챗 배정 draft → 추천

알고리즘 본체는 연구 저장소 event_demo/06_event_loop.py 를 옮겨 온다. 이 파일은 진입점과 DB 입출력만 둔다.
주소(SID)는 당일 재발급하지 않는다(회의록 14).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

APP_VERSION = "0.0.1"
app = FastAPI(title="orbit-compute", version=APP_VERSION)


def require_secret(x_compute_secret: str = Header(default="")) -> None:
    expected = os.environ.get("COMPUTE_SECRET", "")
    if not expected or x_compute_secret != expected:
        raise HTTPException(status_code=401, detail="secret mismatch")


class PrecomputeRequest(BaseModel):
    event_id: str = "dev"
    codebook_version: str | None = None   # 없으면 날짜로 만든다


class CoffeechatRequest(BaseModel):
    event_id: str = "dev"
    min_response_rate: float = 0.5        # 미만이면 대체 경로(텍스트 유사도 + 재회 금지)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "version": APP_VERSION,
        "model": os.environ.get("EMBED_MODEL", "intfloat/multilingual-e5-small"),
        "model_loaded": False,            # 모델 로드 구현 후 갱신
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/precompute", dependencies=[Depends(require_secret)])
def precompute(req: PrecomputeRequest) -> dict:
    # TODO(민찬): 06_event_loop.py 의 issue() + assign_tables() 이식
    # 1) participants/profiles 읽기  2) 임베딩(passage 접두사, 평균 제거)  3) RQ-KMeans K=8 L=3
    # 4) sids/labels 쓰기  5) 테이블토크 배정 draft → assign_versions/tables_meta/table_members/pair_scores
    raise HTTPException(status_code=501, detail="not implemented")


@app.post("/coffeechat", dependencies=[Depends(require_secret)])
def coffeechat(req: CoffeechatRequest) -> dict:
    # TODO(민찬): 체크인 명단 + edges 뷰 + satisfaction 으로 점수 재계산, 커피챗 배정 draft, recs 생성
    # 점수: min(내 seek·상대 offer, 상대 seek·내 offer). 호스트는 단방향. 테이블토크 동석자는 금지 쌍
    raise HTTPException(status_code=501, detail="not implemented")
