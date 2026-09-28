"""DB 입출력. 계산 서비스가 읽고 쓰는 표를 메서드 하나씩으로 둔다(칸 이름은 supabase/migrations/0001_init.sql 그대로).

SupabaseRepo  실제 DB. service_role 키로 접근한다
MemoryRepo    표 모양을 흉내 낸 메모리 저장소. DB 없이 시험하고, 가상 인물로 한 바퀴 돌릴 때 쓴다
"""
from __future__ import annotations

import itertools
import os
from datetime import datetime, timezone
from typing import Any

CHUNK = 500                      # 한 번에 넣는 행 수 (PostgREST 요청 크기 제한 대비)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemoryRepo:
    def __init__(self):
        self.t: dict[str, list[dict]] = {k: [] for k in (
            "participants", "profiles", "sids", "labels", "checkins", "assign_versions", "tables_meta",
            "table_members", "pair_scores", "recs", "card_exchanges", "satisfaction", "ops_state",
            "posters", "poster_interest", "codebooks")}
        self._version = itertools.count(1)

    # ---------- 읽기 ----------
    def participants(self, event_id: str) -> list[dict]:
        return [p for p in self.t["participants"] if p.get("event_id", "dev") == event_id]

    def profiles(self, ids: list[str]) -> dict[str, dict]:
        s = set(ids)
        return {p["participant_id"]: p for p in self.t["profiles"] if p["participant_id"] in s}

    def sids(self, ids: list[str]) -> dict[str, dict]:
        s = set(ids)
        return {r["participant_id"]: r for r in self.t["sids"] if r["participant_id"] in s}

    def checkins(self, ids: list[str]) -> set[str]:
        s = set(ids)
        return {r["participant_id"] for r in self.t["checkins"] if r["participant_id"] in s}

    def edges(self) -> list[dict]:
        """edges 뷰와 같은 모양 — 명함 교환을 무방향 간선 0.3 으로."""
        seen = {}
        for r in self.t["card_exchanges"]:
            a, b = sorted((r["scanner_id"], r["scanned_id"]))
            seen[(a, b)] = {"a": a, "b": b, "kind": "exchange", "weight": 0.3}
        return list(seen.values())

    def posters(self) -> list[dict]:
        return [{"id": p["id"], "title": p["title"], "tags": p.get("tags") or []} for p in self.t["posters"]]

    def poster_interest(self, ids: list[str]) -> list[dict]:
        """[{participant_id, poster_id, choice}]. 키는 0005 마이그레이션의 learn_more · interesting · not_mine."""
        s = set(ids)
        return [r for r in self.t["poster_interest"] if r["participant_id"] in s]

    def satisfaction(self, round_: str, ids: list[str]) -> dict[str, str]:
        """{사람: 선택지 키}. 키는 0005 마이그레이션의 gained · different · unsure · mismatch."""
        s = set(ids)
        return {r["participant_id"]: r["choice"] for r in self.t["satisfaction"] if r["round"] == round_ and r["participant_id"] in s}

    def latest_tables(self, round_: str, ids: list[str], event_id: str = "dev") -> list[dict]:
        """이 행사의 라운드별 최신 배정(공개된 것 우선, 없으면 최신 초안)에서 이 사람들의 자리."""
        s = set(ids)
        vs = [v for v in self.t["assign_versions"]
              if v["round"] == round_ and v["status"] != "retired" and v.get("event_id", "dev") == event_id]
        if not vs:
            return []
        pub = [v for v in vs if v["status"] == "published"]
        ver = max(pub or vs, key=lambda v: v["version"])["version"]
        return [m for m in self.t["table_members"] if m["version"] == ver and m["participant_id"] in s]

    def active_codebook(self, event_id: str) -> dict | None:
        return next((c for c in self.t["codebooks"] if c["event_id"] == event_id and c["active"]), None)

    def ops_get(self, key: str) -> Any:
        for r in self.t["ops_state"]:
            if r["key"] == key:
                return r["value"]
        return None

    # ---------- 쓰기 ----------
    def upsert_sids(self, rows: list[dict]) -> None:
        ids = {r["participant_id"] for r in rows}
        self.t["sids"] = [r for r in self.t["sids"] if r["participant_id"] not in ids] + rows

    def upsert_labels(self, rows: list[dict]) -> None:
        keys = {(r["codebook_version"], tuple(r["prefix"])) for r in rows}
        self.t["labels"] = [r for r in self.t["labels"] if (r["codebook_version"], tuple(r["prefix"])) not in keys] + rows

    def save_codebook(self, row: dict) -> None:
        """행사마다 활성 코드북은 하나. 새로 저장하면 그 행사의 이전 코드북은 active=false."""
        for c in self.t["codebooks"]:
            if c["event_id"] == row["event_id"]:
                c["active"] = False
        self.t["codebooks"].append({**row, "active": True, "created_at": now()})

    def new_version(self, round_: str, params: dict, event_id: str = "dev") -> int:
        v = next(self._version)
        self.t["assign_versions"].append({"version": v, "round": round_, "status": "draft", "params": params,
                                          "event_id": event_id, "created_at": now(), "published_at": None})
        return v

    def insert(self, table: str, rows: list[dict]) -> None:
        self.t[table].extend(rows)

    def ops_set(self, key: str, value: Any) -> None:
        self.t["ops_state"] = [r for r in self.t["ops_state"] if r["key"] != key] + [{"key": key, "value": value, "updated_at": now()}]


class SupabaseRepo:
    """실제 DB. 읽기는 1000행 단위로 끊어 받는다(PostgREST 기본 상한)."""

    def __init__(self, url: str | None = None, key: str | None = None):
        from supabase import create_client
        url = url or os.environ["SUPABASE_URL"]
        key = key or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        from urllib.parse import urlparse
        u = urlparse(url)
        self.db = create_client(f"{u.scheme}://{u.netloc}", key)        # /rest/v1/ 가 붙어 있어도 되게

    def _all(self, make) -> list[dict]:
        """make() 는 매번 새 쿼리를 만든다. 같은 쿼리 객체에 range 를 거듭 걸면 조건이 쌓일 수 있어서."""
        out, start = [], 0
        while True:
            rows = make().range(start, start + 999).execute().data
            out.extend(rows)
            if len(rows) < 1000:
                return out
            start += 1000

    def _in(self, table: str, cols: str, col: str, ids: list[str]) -> list[dict]:
        out = []
        for i in range(0, len(ids), 200):                                 # URL 길이 제한 대비
            part = ids[i:i + 200]
            out += self._all(lambda: self.db.table(table).select(cols).in_(col, part))
        return out

    def participants(self, event_id: str) -> list[dict]:
        return self._all(lambda: self.db.table("participants")
                         .select("id, display_name, role, cohort, is_host, event_id").eq("event_id", event_id))

    def profiles(self, ids):
        return {r["participant_id"]: r for r in self._in("profiles", "participant_id, offer_text, seek_text, topic_tags, intent_tags", "participant_id", ids)}

    def sids(self, ids):
        return {r["participant_id"]: r for r in self._in("sids", "*", "participant_id", ids)}

    def checkins(self, ids):
        return {r["participant_id"] for r in self._in("checkins", "participant_id", "participant_id", ids)}

    def edges(self):
        return self._all(lambda: self.db.table("edges").select("a, b, kind, weight"))

    def posters(self):
        return self._all(lambda: self.db.table("posters").select("id, title, tags"))

    def poster_interest(self, ids):
        return self._in("poster_interest", "participant_id, poster_id, choice", "participant_id", ids)

    def satisfaction(self, round_, ids):
        rows = self._in("satisfaction", "participant_id, round, choice", "participant_id", ids)
        return {r["participant_id"]: r["choice"] for r in rows if r["round"] == round_}

    def latest_tables(self, round_, ids, event_id="dev"):
        vs = self._all(lambda: self.db.table("assign_versions").select("version, status").eq("round", round_)
                       .eq("event_id", event_id).neq("status", "retired"))
        if not vs:
            return []
        pub = [v for v in vs if v["status"] == "published"]
        ver = max(pub or vs, key=lambda v: v["version"])["version"]
        s = set(ids)
        rows = self._all(lambda: self.db.table("table_members").select("version, table_no, participant_id").eq("version", ver))
        return [m for m in rows if m["participant_id"] in s]

    def active_codebook(self, event_id):
        r = self.db.table("codebooks").select("*").eq("event_id", event_id).eq("active", True).limit(1).execute().data
        return r[0] if r else None

    def ops_get(self, key):
        r = self.db.table("ops_state").select("value").eq("key", key).execute().data
        return r[0]["value"] if r else None

    def upsert_sids(self, rows):
        for i in range(0, len(rows), CHUNK):
            self.db.table("sids").upsert(rows[i:i + CHUNK], on_conflict="participant_id").execute()

    def upsert_labels(self, rows):
        for i in range(0, len(rows), CHUNK):
            self.db.table("labels").upsert(rows[i:i + CHUNK], on_conflict="codebook_version,prefix").execute()

    def save_codebook(self, row):
        self.db.table("codebooks").update({"active": False}).eq("event_id", row["event_id"]).eq("active", True).execute()
        self.db.table("codebooks").insert({**row, "active": True}).execute()

    def new_version(self, round_, params, event_id="dev"):
        r = self.db.table("assign_versions").insert({"round": round_, "status": "draft", "params": params,
                                                     "event_id": event_id}).execute().data
        return r[0]["version"]

    def insert(self, table, rows):
        for i in range(0, len(rows), CHUNK):
            self.db.table(table).insert(rows[i:i + CHUNK]).execute()

    def ops_set(self, key, value):
        self.db.table("ops_state").upsert({"key": key, "value": value, "updated_at": now()}, on_conflict="key").execute()
