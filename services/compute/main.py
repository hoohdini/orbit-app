"""orbit-app 계산 서비스 (2026-09-26).

하는 일은 둘뿐이다. 알고리즘은 pipeline/, 흐름은 service.py, DB 입출력은 repo.py 에 있다.
  /precompute  행사 전날. 사전 등록자 전원 임베딩 → 코드북 → 주소·라벨 발급 → 테이블토크 배정 draft
  /coffeechat  테이블토크 종료 뒤. 체크인 명단 + edges + satisfaction 으로 점수 재계산 → 커피챗 배정 draft → 추천

알고리즘은 연구 저장소 event_demo/06_event_loop.py 를 옮긴 것이다. 이 파일은 진입점만 둔다. 잘못된 상태(사람 부족 · 코드북 없음)는 409.
주소(SID)는 당일 재발급하지 않는다(회의록 14).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

import service

APP_VERSION = "0.1.0"
app = FastAPI(title="orbit-compute", version=APP_VERSION)

_enc = None
_repo = None


def encoder():
    """모델은 처음 부를 때 한 번 올린다(약 9초). 이후 요청은 재사용."""
    global _enc
    if _enc is None:
        from pipeline.embed import Encoder
        _enc = Encoder()
    return _enc


def get_repo():
    global _repo
    if _repo is None:
        from repo import SupabaseRepo
        _repo = SupabaseRepo()
    return _repo


def require_secret(x_compute_secret: str = Header(default="")) -> None:
    expected = os.environ.get("COMPUTE_SECRET", "")
    if not expected or x_compute_secret != expected:
        raise HTTPException(status_code=401, detail="secret mismatch")


class PrecomputeRequest(BaseModel):
    event_id: str = "dev"
    codebook_version: str | None = None   # 없으면 날짜로 만든다
    reuse_codebook: bool = False          # 체크인 마감 때 true — 저장된 코드북에 현장 등록자만 붙이고 배정을 다시 낸다
    table_mode: str = "min"               # 테이블 점수 결합: min | avg | harmonic
    random_ratio: float = 0.0             # 무작위로 앉히는 자리 비율 (리허설 정확도 0.65 미만이면 0.15~0.40)


class CoffeechatRequest(BaseModel):
    event_id: str = "dev"
    min_response_rate: float = 0.5        # 미만이면 대체 경로(텍스트 유사도 + 재회 금지)
    table_mode: str = "min"
    rec_mode: str | None = None           # 개인 추천 점수. 없으면 환경변수 REC_SCORE (기본 min)
    random_ratio: float = 0.0
    beta: float = 0.5                     # 만남 반영 세기. 구인구직 자료 최적값


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "version": APP_VERSION,
        "model": os.environ.get("EMBED_MODEL", "intfloat/multilingual-e5-small"),
        "model_loaded": _enc is not None,
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/precompute", dependencies=[Depends(require_secret)])
def precompute(req: PrecomputeRequest) -> dict:
    try:
        return service.precompute(get_repo(), encoder(), **req.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.post("/coffeechat", dependencies=[Depends(require_secret)])
def coffeechat(req: CoffeechatRequest) -> dict:
    try:
        return service.coffeechat(get_repo(), encoder(), **req.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
