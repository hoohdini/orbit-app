// GET /api/card/search?q=  카메라를 못 쓸 때 이름으로 상대를 찾는다. 같은 행사 · 체크인된 사람 · 본인 제외 · 최대 10명. 운영진도 참가자와 같이 찾힌다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const Query = z.object({ q: z.string().trim().min(2).max(20) });
const LIMIT = 10;

export async function GET(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const { q } = Query.parse({ q: new URL(req.url).searchParams.get("q") ?? "" });
    const safe = q.replace(/[%_,.()]/g, "");
    if (!safe) return ok({ people: [] });

    const { data: people, error } = await db()
      .from("participants")
      .select("id, display_name, affiliation")
      .eq("event_id", eventId())
      .neq("id", s.pid)
      .ilike("display_name", `%${safe}%`)
      .order("display_name")
      .limit(50);
    if (error) throw error;
    const ids = (people ?? []).map((p) => p.id as string);
    if (ids.length === 0) return ok({ people: [] });

    const { data: ci, error: ciErr } = await db().from("checkins").select("participant_id").in("participant_id", ids);
    if (ciErr) throw ciErr;
    const checked = new Set((ci ?? []).map((c) => c.participant_id as string));
    return ok({ people: (people ?? []).filter((p) => checked.has(p.id as string)).slice(0, LIMIT) });
  });
}
