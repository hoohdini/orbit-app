// POST /api/poster/interest { poster_id, score }  스캔 기록이 있는 포스터에만 관심도를 남길 수 있다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

const Body = z.object({
  poster_id: z.number().int().positive(),
  score: z.number().int().min(1).max(5),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());

    const { data: scanned, error: scanErr } = await db()
      .from("event_log")
      .select("id")
      .eq("kind", "poster_scan")
      .eq("participant_id", s.pid)
      .eq("payload->>poster_id", String(b.poster_id))
      .limit(1)
      .maybeSingle();
    if (scanErr) throw scanErr;
    if (!scanned) return fail("SCAN_REQUIRED", "이 포스터를 먼저 스캔해야 한다", 403);

    const { error } = await db()
      .from("poster_interest")
      .upsert({ participant_id: s.pid, poster_id: b.poster_id, score: b.score }, { onConflict: "participant_id,poster_id" });
    if (error) throw error;

    await logEvent("poster_interest", s.pid, { poster_id: b.poster_id, score: b.score });
    return ok({ saved: true });
  });
}
