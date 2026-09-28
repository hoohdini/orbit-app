// POST /api/ops/checkin { participant_id, is_late? }  운영자가 수동으로 체크인한다. 이미 돼 있으면 그대로 두고 already:true 로 알린다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { eventParticipant, UUID } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({ participant_id: z.string().regex(UUID, "uuid 형식"), is_late: z.boolean().default(false) });

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = Body.parse(await req.json());
    const p = await eventParticipant(b.participant_id);
    if (!p) return fail("NOT_FOUND", "이 행사의 참가자가 아니다", 404);

    const { data: prev, error } = await db().from("checkins").select("checked_at, is_late").eq("participant_id", b.participant_id).maybeSingle();
    if (error) throw error;
    if (prev) return ok({ checked_at: prev.checked_at, is_late: prev.is_late, already: true });

    const { data, error: e2 } = await db()
      .from("checkins")
      .insert({ participant_id: b.participant_id, is_late: b.is_late, by_admin: admin.pid })
      .select("checked_at, is_late")
      .single();
    if (e2) throw e2;
    await logEvent("ops_checkin", admin.pid, { target: b.participant_id, is_late: b.is_late });
    return ok({ checked_at: data.checked_at, is_late: data.is_late, already: false });
  });
}
