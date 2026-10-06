// GET /api/card/keyword?q=  사람 찾기(시제품, 민찬 제안 2026-10-05. 회의 채택 전, 명함 모듈 담당 성하 검토 필요).
// 글자 검색(관심 태그 · 지금 하는 일에 검색어 2자 이상. 줄임말 사전의 같은 뜻 다른 표기도 함께) + 뜻 검색(계산 서비스 /search, 0.5초 안에 답이 없으면 건너뜀)을 합쳐
// 우리 추천 점수(상호 점수) 높은 순으로 최대 20명. 체크인 · 동의한 사람만, 본인 제외. 점수 숫자는 화면에 주지 않는다.
// 공개 범위: 이력 한 줄과 '지금 하는 일' 전문. '찾는 사람' 칸은 찾지도 보여 주지도 않는다.
// 이미 명함을 교환한 사람은 빼지 않고 exchanged 로 표시한다. semantic: 뜻 검색이 이번에 쓰였는지(늦거나 꺼져 있으면 false).
// 검색어는 event_log(keyword_search)에, 결과에서 사람을 열면 /api/card/keyword/open 이 keyword_open 으로 남긴다. 계산 서비스가 추천에 반영한다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { firstSentence } from "@/lib/text";
import { matchPerson, semanticHit, rankHits, expandQuery, KEYWORD_LIMIT, MIN_QUERY, type KeywordHit } from "../_keyword";
import { searchablePeople, canSearch } from "../_people";
import { loadVecs, mutual } from "../_vec";

export const dynamic = "force-dynamic";

const Query = z.object({ q: z.string().trim().min(MIN_QUERY).max(30) });
const SEMANTIC_TIMEOUT_MS = 500;

// 계산 서비스 뜻 검색. 주소 · 비밀키가 없거나, 실패하거나, 0.5초를 넘기면 null(글자 검색만 쓴다)
type Semantic = { ids: string[]; all: Record<string, number> };

// pool = 검색할 수 있는 사람(체크인 · 동의, 본인 제외). 계산 서비스가 이 사람들 안에서만 기준(평균 + 1 표준편차) · 상위 10명을 잡는다
async function semantic(q: string, viewer: string, aliases: string[], pool: string[]): Promise<Semantic | null> {
  const base = (process.env.COMPUTE_URL ?? "").trim().replace(/\/+$/, "");
  const secret = process.env.COMPUTE_SECRET ?? "";
  if (!base || !secret) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SEMANTIC_TIMEOUT_MS);
  try {
    const r = await fetch(base + "/search", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Compute-Secret": secret },
      body: JSON.stringify({ event_id: eventId(), q, viewer_id: viewer, aliases, pool }),
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { people?: { id: string }[]; all_scores?: Record<string, number> };
    return { ids: (j.people ?? []).map((p) => p.id), all: j.all_scores ?? {} };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const { q } = Query.parse({ q: new URL(req.url).searchParams.get("q") ?? "" });
    if (!(await canSearch(s.pid))) return fail("FORBIDDEN", "이용 동의와 체크인 뒤에 검색할 수 있다", 403);

    const ex = expandQuery(q);
    const people = (await searchablePeople()).filter((p) => p.id !== s.pid);
    const sem = await semantic(q, s.pid, ex.aliases, people.map((p) => p.id));
    const byId = new Map(people.map((p) => [p.id, p]));
    const hits = new Map<string, KeywordHit>();
    const direct = new Set<string>(); // 검색어 그대로 맞은 사람(사전 표기로만 맞은 사람 제외)
    for (const p of people) {
      const h = matchPerson(p, q, ex.terms);
      if (!h) continue;
      hits.set(p.id, h);
      if (ex.terms.length === 1 || matchPerson(p, q)) direct.add(p.id);
    }
    if (sem) {
      // 뜻으로만 찾은 사람은 글자로 맞은 사람 중 가장 낮은 뜻 점수 이상일 때만(글자 검색보다 약한 짝을 끌어오지 않게).
      // 기준은 검색어 그대로 맞은 사람들, 없으면 사전 표기로 맞은 사람들
      const base = direct.size > 0 ? [...direct] : [...hits.keys()];
      const textScores = base.map((id) => sem.all[id]).filter((x): x is number => typeof x === "number");
      const floor = textScores.length > 0 ? Math.min(...textScores) : -Infinity;
      for (const id of sem.ids) {
        const p = byId.get(id);
        if (p && !hits.has(id) && (sem.all[id] ?? -Infinity) >= floor) hits.set(id, semanticHit(p));
      }
    }
    const list = [...hits.values()];
    const ids = list.map((h) => h.person.id);

    const vecs = await loadVecs([s.pid, ...ids]);
    const me = vecs.get(s.pid);
    if (me) for (const h of list) {
      const v = vecs.get(h.person.id);
      if (v) h.score = mutual(me, v);
    }

    let exchanged = new Set<string>();
    if (ids.length > 0) {
      const { data, error } = await db().from("card_exchanges").select("scanned_id").eq("scanner_id", s.pid).in("scanned_id", ids);
      if (error) throw error;
      exchanged = new Set((data ?? []).map((r) => r.scanned_id as string));
    }

    const ranked = rankHits(list, s.pid).slice(0, KEYWORD_LIMIT);
    await logEvent("keyword_search", s.pid, { q, hits: list.length, semantic: sem !== null, aliases: ex.aliases.length });
    return ok({
      q,
      aliases: ex.aliases,
      total: list.length,
      semantic: sem !== null,
      people: ranked.map((h) => ({
        id: h.person.id,
        display_name: h.person.display_name,
        affiliation: h.person.affiliation,
        cohort: h.person.cohort,
        career_line: firstSentence(h.person.offer_text),
        offer_text: h.person.offer_text,
        matched_fields: h.fields,
        matched_tags: h.tags,
        exchanged: exchanged.has(h.person.id),
      })),
    });
  });
}
