// POST /api/poster/interest { poster_id, choice }  스캔 기록이 있는 포스터에만 관심도를 남길 수 있다
// 개발 지시서 v0.2 부터는 /api/poster/response(관심 이유 4지선다)를 쓴다. 이 API 는 데모 화면이 바뀔 때까지만 둔다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { collectGuard } from "@/lib/consent";
import { INTEREST_KEYS } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({
  poster_id: z.number().int().positive(),
  choice: z.enum(INTEREST_KEYS),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const guard = await collectGuard(s.pid); // 동의 거부자는 행사 중 수집 제외(10/5 회의)
    if (guard) return guard;
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
      .upsert({ participant_id: s.pid, poster_id: b.poster_id, choice: b.choice }, { onConflict: "participant_id,poster_id" });
    if (error) throw error;

    await logEvent("poster_interest", s.pid, { poster_id: b.poster_id, choice: b.choice });
    return ok({ saved: true });
  });
}
