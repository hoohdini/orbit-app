// GET /api/card/twolist  방금 만난 사람과 '비슷한 분' 3명 · '다른 분야 분' 3명(시제품, 민찬 제안 2026-10-05).
// 만족도를 묻는 대신 고르게 한다. 방금 만난 사람이 좋았으면 비슷한 쪽, 아니면 다른 쪽에서 다음 사람을 찾아갈 것이라는 생각.
// 누구와 교환하는지가 곧 피드백이고, 교환할 때마다 다음 목록이 그 사람 쪽으로 갱신된다.
//
// 방금 만난 사람(anchor) = 내가 가장 최근에 명함을 교환한 사람(벡터가 없는 현장 등록자면 그 전 사람). 아직 없으면 anchor null
//   card_exchanges 는 교환 한 건에 두 행(찍은 쪽 · 받은 쪽)이라 scanner_id = 나 로 양쪽 방향이 다 잡힌다.
//   이름 검색 교환의 확인 대기(status=pending, H-05-BE2)가 생기면 여기서도 빼야 한다(그 칸이 아직 없어 지금은 못 거름)
// 지금 나의 찾는 방향 = 저장된 Seek 를, 오늘 명함을 교환한 사람들 Offer 평균 쪽으로 0.5 옮긴 것(계산 서비스 명함 반영과 같은 식)
// 후보 = 체크인 · 동의한 다른 사람 중 아직 교환 안 했고 지금 테이블 · 그룹 동석자가 아닌 사람
// 비슷한 분 = 방금 만난 사람과 하는 일 뜻이 가까운 순으로 앞 절반에서 상호 점수 높은 3명, 다른 분야 분 = 뒤 절반에서 3명
// 보여 준 목록은 event_log(twolist_shown)에 남겨, 나중에 어느 쪽에서 골랐는지와 만족도를 비교한다(리허설 평가용)
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { firstSentence } from "@/lib/text";
import { getMyTable } from "@/lib/participants";
import { searchablePeople, canSearch } from "../_people";
import { loadVecs, mutual, seekToward, mean, dot, type Vecs } from "../_vec";

export const dynamic = "force-dynamic";

const PER_LIST = 3;
const CARD_BETA = 0.5;

async function tablemates(pid: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const round of ["tabletalk", "coffeechat"] as const) {
    const mine = await getMyTable(pid, round);
    if (!mine) continue;
    const { data, error } = await db()
      .from("current_tables")
      .select("participant_id")
      .eq("round", round)
      .eq("version", mine.version)
      .eq("table_no", mine.table_no);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.participant_id as string);
  }
  return out;
}

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    if (!(await canSearch(s.pid))) return fail("FORBIDDEN", "이용 동의와 체크인 뒤에 볼 수 있다", 403);

    const { data: ex, error } = await db()
      .from("card_exchanges")
      .select("scanned_id, created_at")
      .eq("scanner_id", s.pid)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const partners = [...new Set((ex ?? []).map((r) => r.scanned_id as string))];
    if (partners.length === 0) return ok({ anchor: null, similar: [], different: [] });

    const [people, mates] = await Promise.all([searchablePeople(), tablemates(s.pid)]);
    const taken = new Set([s.pid, ...partners, ...mates]);
    const cand = people.filter((p) => !taken.has(p.id));
    const vecs = await loadVecs([s.pid, ...partners, ...cand.map((p) => p.id)]);
    const meBase = vecs.get(s.pid);
    const anchorId = partners.find((id) => vecs.has(id)) ?? partners[0];
    const anchor = vecs.get(anchorId);
    if (!meBase || !anchor) return ok({ anchor: { id: anchorId }, similar: [], different: [] });

    const partnerOffers = partners.map((id) => vecs.get(id)?.offer).filter((v): v is number[] => !!v);
    const me: Vecs = { offer: meBase.offer, seek: seekToward(meBase.seek, mean(partnerOffers), CARD_BETA) };

    const scored = cand
      .map((p) => ({ p, v: vecs.get(p.id) }))
      .filter((x): x is { p: (typeof cand)[number]; v: Vecs } => !!x.v)
      .map((x) => ({ p: x.p, score: mutual(me, x.v), near: dot(x.v.offer, anchor.offer) }));
    if (scored.length === 0) return ok({ anchor: { id: anchorId }, similar: [], different: [] });
    // 가까운 순으로 줄 세워 반으로 나눈다(같은 값이 많아도 한쪽으로 몰리지 않게 순위로)
    const byNear = [...scored].sort((a, b) => b.near - a.near || a.p.id.localeCompare(b.p.id));
    const half = Math.ceil(byNear.length / 2);
    const pick = (xs: typeof scored) => [...xs].sort((a, b) => b.score - a.score).slice(0, PER_LIST);
    const similar = pick(byNear.slice(0, half));
    const different = pick(byNear.slice(half));

    const card = (x: (typeof scored)[number]) => ({
      id: x.p.id,
      display_name: x.p.display_name,
      affiliation: x.p.affiliation,
      cohort: x.p.cohort,
      career_line: firstSentence(x.p.offer_text),
      offer_text: x.p.offer_text,
    });
    const anchorPerson = people.find((p) => p.id === anchorId);
    await logEvent("twolist_shown", s.pid, {
      anchor: anchorId,
      similar: similar.map((x) => x.p.id),
      different: different.map((x) => x.p.id),
    });
    return ok({
      anchor: { id: anchorId, display_name: anchorPerson?.display_name ?? null },
      similar: similar.map(card),
      different: different.map(card),
    });
  });
}
