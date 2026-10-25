// POST /api/ops/checkin/leave { participant_id, undo? }  운영자가 일찍 나간 사람을 표시하거나 되돌린다(10/25 민찬 결정, checkins.left_at · 0019).
// 표시: left_at = 지금 · left_by = 운영자. 되돌리기(undo: true): 둘 다 비운다. 체크인 안 한 사람은 409 NOT_CHECKED_IN.
// 운영자는 단계와 상관없이 고칠 수 있다(본인 버튼은 커피챗까지만. 구현하며 정함). 이미 같은 상태면 그대로 두고 already: true
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { eventParticipant, UUID } from "../../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({ participant_id: z.string().regex(UUID, "uuid 형식"), undo: z.boolean().default(false) });

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = Body.parse(await req.json());
    const p = await eventParticipant(b.participant_id);
    if (!p) return fail("NOT_FOUND", "이 행사의 참가자가 아니다", 404);

    const { data: prev, error } = await db().from("checkins").select("left_at").eq("participant_id", b.participant_id).maybeSingle();
    if (error) throw error;
    if (!prev) return fail("NOT_CHECKED_IN", "체크인하지 않은 사람이다", 409);
    if (!!prev.left_at === !b.undo) return ok({ left_at: (prev.left_at as string | null) ?? null, already: true });

    const { data, error: e2 } = await db()
      .from("checkins")
      .update(b.undo ? { left_at: null, left_by: null } : { left_at: new Date().toISOString(), left_by: admin.pid })
      .eq("participant_id", b.participant_id)
      .select("left_at")
      .single();
    if (e2) throw e2;
    await logEvent(b.undo ? "ops_checkin_leave_undo" : "ops_checkin_leave", admin.pid, { target: b.participant_id });
    return ok({ left_at: (data.left_at as string | null) ?? null, already: false });
  });
}
