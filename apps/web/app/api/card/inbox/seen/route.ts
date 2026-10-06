// POST /api/card/inbox/seen { exchange_ids?: number[] }  알림을 본 것으로 표시한다. 비우면 전부
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

const Body = z.object({ exchange_ids: z.array(z.number().int().positive()).max(200).optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json().catch(() => ({})));
    let q = db().from("card_exchanges").update({ seen_at: new Date().toISOString() }).eq("scanner_id", s.pid).eq("source", "auto").eq("status", "confirmed").is("seen_at", null);
    if (b.exchange_ids && b.exchange_ids.length > 0) q = q.in("id", b.exchange_ids);
    const { data, error } = await q.select("id");
    if (error) throw error;
    const n = (data ?? []).length;
    if (n > 0) await logEvent("card_seen", s.pid, { count: n });
    return ok({ seen: n });
  });
}
