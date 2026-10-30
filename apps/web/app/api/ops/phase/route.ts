// POST /api/ops/phase { phase }  행사 단계 전환(개발 지시서 v0.2 A-02). 정해진 8개 값만 받는다(lib/phase.ts. 10/21 커피챗 자유 이동 단계를 뺌).
// 참가자 화면은 상태 API(/api/state) 15초 폴링으로 따라온다. 바꾼 사람과 시각은 phase_meta 와 event_log(ops_phase, 감사 로그 A-09)에 남는다.
// 처음 마무리(wrapup) · 시상(award)으로 넘어가는 순간을 미션 마감 시각(mission_closed_at)으로 고정한다. 앞 단계로 되돌려도 마감은 풀리지 않는다
// (실수로 넘겼으면 reopen_missions: true 로 함께 보내 마감을 지운다).
// 행사 전이 아닌 단계(보통 등록 · 개회)로 바꿀 때마다 오늘(한국 시각) 전에 생긴 체크인 · 미션 마감 · 추첨 결과 · 커피챗 공개본을 치운다(lib/eventDay.ts, 10/30 민찬 결정)
import { z } from "zod";
import { ok, handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { PHASE_KEYS, MISSION_CLOSED, phaseLabel } from "@/lib/phase";
import { readOps } from "@/lib/opsState";
import { opsSet } from "../_lib";
import { db } from "@/lib/db";
import { clearBeforeToday } from "@/lib/eventDay";

export const dynamic = "force-dynamic";

const Body = z.object({ phase: z.enum(PHASE_KEYS), reopen_missions: z.boolean().default(false) });

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = Body.parse(await req.json());
    const cleared = b.phase !== "before" ? await clearBeforeToday() : null; // 등록 · 개회를 건너뛰어도 정리되게 행사 전이 아닌 단계마다(오늘 전 것만이라 여러 번 돌아도 같음)
    const cur = await readOps(["phase", "mission_closed_at"]);
    const at = new Date().toISOString();

    await opsSet("phase", b.phase);
    await opsSet("phase_meta", { at, by: admin.pid, prev: (cur.phase as string | undefined) ?? null });

    let missionClosedAt = (cur.mission_closed_at as string | undefined) ?? null;
    if (b.reopen_missions && missionClosedAt) {
      const { error } = await db().from("ops_state").delete().eq("key", "mission_closed_at");
      if (error) throw error;
      missionClosedAt = null;
    }
    if (MISSION_CLOSED.includes(b.phase) && !missionClosedAt) {
      missionClosedAt = at;
      await opsSet("mission_closed_at", at);
    }

    await logEvent("ops_phase", admin.pid, { phase: b.phase, prev: cur.phase ?? null, mission_closed_at: missionClosedAt, reopened: b.reopen_missions, cleared });
    return ok({ phase: b.phase, phase_label: phaseLabel(b.phase), at, mission_closed_at: missionClosedAt, cleared });
  });
}
