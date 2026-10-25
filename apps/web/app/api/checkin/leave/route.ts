// POST /api/checkin/leave { undo? }  참가자 본인이 일찍 나간다고 표시한다(10/25 민찬 결정, checkins.left_at · 0019).
// undo 가 없거나 false 면 left_at = 지금 · left_by = null(본인). undo: true 면 다시 참여(left_at · left_by 를 비운다).
// 체크인한 사람만(아니면 409 NOT_CHECKED_IN). 등록 · 개회부터 커피챗까지만 받는다(lib/phase.ts LEAVE_OPEN, 아니면 409 LEAVE_NOT_OPEN).
// 0019 가 DB 에 없으면 503 LEAVE_UNAVAILABLE.
// 표시하면 커피챗 계산이 이 사람을 앉히지 않고, 늦게 온 사람 자리(lib/coffeechatLate.ts)도 주지 않는다. 이미 공개된 커피챗 자리는 그대로 둔다(빈자리).
// 이미 같은 상태면 그대로 두고 같은 값을 돌려준다(두 번 눌러도 처음 시각 유지. 구현하며 정함)
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { myCheckin, noLeftColumn } from "@/lib/checkinLeft";
import { opsSnapshot } from "@/lib/opsState";
import { leaveOpen } from "@/lib/phase";

export const dynamic = "force-dynamic";

// 0019(checkins.left_at · left_by)가 DB 에 없을 때. 다른 화면은 나간 사람 없음으로 계속 돈다(lib/checkinLeft.ts)
const UNAVAILABLE = "DB 에 0019 마이그레이션(일찍 나감 칸)이 없어 나감 표시를 쓸 수 없다";

const Body = z.object({ undo: z.boolean().default(false) });

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json().catch(() => ({})));
    const ops = await opsSnapshot();
    if (!leaveOpen(ops.phase)) return fail("LEAVE_NOT_OPEN", "행사 진행 중(커피챗까지)에만 바꿀 수 있다", 409);

    const prev = await myCheckin(s.pid);
    if (prev.legacy) return fail("LEAVE_UNAVAILABLE", UNAVAILABLE, 503);
    if (!prev.checked_in) return fail("NOT_CHECKED_IN", "체크인한 뒤에 표시할 수 있다", 409);
    if (!!prev.left_at === !b.undo) return ok({ left_at: prev.left_at });

    const { data, error: e2 } = await db()
      .from("checkins")
      .update(b.undo ? { left_at: null, left_by: null } : { left_at: new Date().toISOString(), left_by: null })
      .eq("participant_id", s.pid)
      .select("left_at")
      .single();
    if (noLeftColumn(e2)) return fail("LEAVE_UNAVAILABLE", UNAVAILABLE, 503);
    if (e2) throw e2;
    await logEvent(b.undo ? "checkin_leave_undo" : "checkin_leave", s.pid, { by: null, phase: ops.phase });
    return ok({ left_at: (data.left_at as string | null) ?? null });
  });
}
