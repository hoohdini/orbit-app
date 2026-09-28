// POST /api/tabletalk/satisfaction { choice, comment? }  테이블토크가 끝날 때 만족도 팝업. 선택지는 _choices.ts
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { SATISFACTION_KEYS } from "../_choices";

export const dynamic = "force-dynamic";

const Body = z.object({
  choice: z.enum(SATISFACTION_KEYS),
  comment: z.string().trim().max(300).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());

    const { error } = await db()
      .from("satisfaction")
      .upsert(
        { participant_id: s.pid, round: "tabletalk", choice: b.choice, comment: b.comment ?? null },
        { onConflict: "participant_id,round" }
      );
    if (error) throw error;

    await logEvent("tabletalk_satisfaction", s.pid, { choice: b.choice });
    return ok({ saved: true });
  });
}
