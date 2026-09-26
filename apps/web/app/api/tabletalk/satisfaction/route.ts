// POST /api/tabletalk/satisfaction { score, comment? }  테이블토크가 끝날 때 만족도 팝업
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

const Body = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(300).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());

    const { error } = await db()
      .from("satisfaction")
      .upsert(
        { participant_id: s.pid, round: "tabletalk", score: b.score, comment: b.comment ?? null },
        { onConflict: "participant_id,round" }
      );
    if (error) throw error;

    await logEvent("tabletalk_satisfaction", s.pid, { score: b.score });
    return ok({ saved: true });
  });
}
