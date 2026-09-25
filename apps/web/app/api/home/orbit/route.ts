// GET /api/home/orbit  체크인된 사람들을 내 주소와의 앞자리 일치 길이로 링에 나눈다.
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { labelFor } from "@/lib/participants";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

const RING_CAP = 12;
const SID_LEN = 3;

type OrbitPerson = { id: string; display_name: string; affiliation: string | null; role: string; topic_tags: string[]; sid_prefix: number[] };

function commonPrefix(a: number[], b: number[]): number {
  let n = 0;
  while (n < SID_LEN && a[n] !== undefined && a[n] === b[n]) n++;
  return n;
}

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const mine = await db().from("sids").select("offer_sid, codebook_version").eq("participant_id", s.pid).maybeSingle();
    if (mine.error) throw mine.error;
    if (!mine.data) return ok({ me: null, rings: [], hidden_count: 0, checked_in_total: 0 });
    const mySid = mine.data.offer_sid as number[];
    const version = mine.data.codebook_version as string;

    const [checkins, sids, people, profiles] = await Promise.all([
      db().from("checkins").select("participant_id"),
      db().from("sids").select("participant_id, offer_sid").eq("codebook_version", version),
      db().from("participants").select("id, display_name, affiliation, role"),
      db().from("profiles").select("participant_id, topic_tags"),
    ]);
    for (const r of [checkins, sids, people, profiles]) if (r.error) throw r.error;

    const checked = new Set((checkins.data ?? []).map((c) => c.participant_id as string));
    const sidOf = new Map((sids.data ?? []).map((r) => [r.participant_id as string, r.offer_sid as number[]]));
    const tagsOf = new Map((profiles.data ?? []).map((r) => [r.participant_id as string, (r.topic_tags as string[]) ?? []]));

    const buckets: Record<number, OrbitPerson[]> = { 3: [], 2: [], 1: [] };
    for (const p of people.data ?? []) {
      if (p.id === s.pid || !checked.has(p.id)) continue;
      const sid = sidOf.get(p.id);
      if (!sid) continue;
      const m = commonPrefix(mySid, sid);
      if (m === 0) continue;
      buckets[m].push({ id: p.id, display_name: p.display_name, affiliation: p.affiliation, role: p.role, topic_tags: tagsOf.get(p.id) ?? [], sid_prefix: sid.slice(0, m) });
    }

    let hidden = 0;
    const rings = [3, 2, 1].map((m) => {
      const all = buckets[m].sort((a, b) => a.display_name.localeCompare(b.display_name, "ko"));
      hidden += Math.max(0, all.length - RING_CAP);
      return { match_len: m, total: all.length, people: all.slice(0, RING_CAP) };
    });

    await logEvent("open_orbit", s.pid);
    return ok({
      me: { sid: mySid, prefix: mySid.slice(0, 2), label: await labelFor(version, mySid) },
      rings,
      hidden_count: hidden,
      checked_in_total: checked.size,
    });
  });
}
