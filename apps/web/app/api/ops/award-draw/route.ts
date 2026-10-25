// POST /api/ops/award-draw { redo? }  특별 시상 경계 공동 순위 추첨(10/25 민찬 결정, 운영자 전용).
// 공동 순위 때문에 수상자가 5명을 넘으면 그 순위의 공동인 사람들(pool) 중 남은 자리 수(count)만큼 똑같은 확률로 뽑는다.
// 결과는 ops_state award_draw 에 남겨 다시 열어도 같은 결과가 보인다. 대상이 그대로면 다시 눌러도 새로 뽑지 않고 저장된 결과를 돌려준다.
// 순위가 바뀌어 대상이 달라졌으면 redo true 로만 다시 뽑는다(아니면 409 DRAW_POOL_CHANGED). event_log 에는 전부 남는다
import { randomInt } from "crypto";
import { z } from "zod";
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { opsSnapshot } from "@/lib/opsState";
import { missionStatuses, checkedInIds } from "@/lib/missions";
import { AWARD_SEATS, splitSeats, sameDraw } from "@/lib/award";
import { opsGet, opsSet, awardRanking, type AwardDraw } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({ redo: z.boolean().optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { redo } = Body.parse(await req.json().catch(() => ({})));
    const [ops, ids, saved] = await Promise.all([opsSnapshot(), checkedInIds(eventId()), opsGet<AwardDraw>("award_draw")]);
    const stat = await missionStatuses(ids, ops.missionClosedAt);
    const { ranked } = await awardRanking(ids, stat);
    const { drawGroup, drawCount } = splitSeats(ranked, AWARD_SEATS);
    if (drawGroup.length === 0) return fail("NO_DRAW_NEEDED", "지금 순위로는 수상자가 5명을 넘지 않아 추첨할 필요가 없다", 409);

    const cur = { place: drawGroup[0].place, pool: drawGroup.map((c) => c.id) };
    if (saved && sameDraw(saved, cur)) return ok({ ...saved, reused: true });
    if (saved && !redo) return fail("DRAW_POOL_CHANGED", "순위가 바뀌어 추첨 대상이 저장된 결과와 다르다. 다시 뽑으려면 redo 로 한 번 더 요청한다", 409);

    // 앞에서부터 하나씩 남은 사람 중 무작위로 골라 자리를 바꾼다(부분 Fisher-Yates, crypto 난수)
    const pool = [...cur.pool];
    for (let i = 0; i < drawCount; i++) {
      const j = i + randomInt(pool.length - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const result: AwardDraw = { at: new Date().toISOString(), place: cur.place, pool: cur.pool, picked: pool.slice(0, drawCount) };
    await opsSet("award_draw", result);
    await logEvent("ops_award_draw", admin.pid, { ...result, redo: !!saved, prev: saved });
    return ok({ ...result, reused: false });
  });
}
