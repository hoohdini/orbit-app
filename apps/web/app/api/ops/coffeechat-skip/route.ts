// POST /api/ops/coffeechat-skip { participant_id, skip }  커피챗 불참 명단(ops_state coffeechat_skip)에 넣거나 뺀다(10/27 민찬 결정).
// 명단에 있으면 체크인해도 커피챗 계산 · 늦게 온 사람 자리를 받지 않는다. 당일 마음이 바뀐 사람을 콘솔 체크인 칸에서 바로 고치려고 둔다.
// 이미 계산 · 공개한 커피챗 자리는 바꾸지 않는다(넣었으면 배정 보기 경고 → 다시 계산, 뺐으면 체크인한 사람은 다음 상태 갱신 때 빈자리를 받는다).
// 이미 같은 상태면 그대로 두고 already: true. 운영자만
import { z } from "zod";
import { ok, fail, handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { COFFEECHAT_SKIP_KEY, coffeechatSkip } from "@/lib/opsState";
import { eventParticipant, opsGet, opsSet, UUID } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({ participant_id: z.string().regex(UUID, "uuid 형식"), skip: z.boolean() });

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = Body.parse(await req.json());
    const p = await eventParticipant(b.participant_id);
    if (!p) return fail("NOT_FOUND", "이 행사의 참가자가 아니다", 404);
    const id = b.participant_id.toLowerCase();
    const cur = coffeechatSkip(await opsGet(COFFEECHAT_SKIP_KEY));
    if (cur.has(id) === b.skip) return ok({ skip: b.skip, already: true, count: cur.size });
    if (b.skip) cur.add(id);
    else cur.delete(id);
    await opsSet(COFFEECHAT_SKIP_KEY, [...cur]);
    await logEvent(b.skip ? "ops_coffeechat_skip" : "ops_coffeechat_skip_undo", admin.pid, { target: b.participant_id });
    return ok({ skip: b.skip, already: false, count: cur.size });
  });
}
