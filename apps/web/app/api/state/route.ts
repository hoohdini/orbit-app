// GET /api/state  참가자 화면이 15초마다 부르는 상태 하나(개발 지시서 v0.2 B-09).
// 전역 상태 띠(H-01), 추천 접힘(H-04), 만족도 노출(N-03), 새 배정 안내(N-06), 미션 현황(E-01)이 이것만 본다.
import { db } from "@/lib/db";
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { consentOf } from "@/lib/consent";
import { opsSnapshot } from "@/lib/opsState";
import { phaseLabel, recsOpen, missionWindow } from "@/lib/phase";
import { missionStatus } from "@/lib/missions";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const [me, ops, mine, published] = await Promise.all([
      db().from("participants").select("consent_at, consent_refused_at").eq("id", s.pid).maybeSingle(),
      opsSnapshot(),
      db().from("current_tables").select("round, version, table_no, seat_no").eq("participant_id", s.pid).eq("event_id", eventId()),
      db().from("assign_versions").select("round, version").eq("event_id", eventId()).eq("status", "published").order("version", { ascending: false }),
    ]);
    if (me.error) throw me.error;
    if (!me.data) return fail("NOT_FOUND", "참가자를 찾을 수 없다", 404);
    if (mine.error) throw mine.error;
    if (published.error) throw published.error;

    const seat = (round: string) => (mine.data ?? []).find((r) => r.round === round);
    const tt = seat("tabletalk");
    const cc = seat("coffeechat");
    const pub = (round: string) => ((published.data ?? []).find((v) => v.round === round)?.version as number | undefined) ?? null;
    const window = missionWindow(ops.phase);
    const m = await missionStatus(s.pid, ops.missionClosedAt);

    return ok({
      phase: ops.phase,
      phase_label: phaseLabel(ops.phase),
      phase_at: ops.phaseMeta?.at ?? null,
      notice: ops.notice ? { text: ops.notice.text, expires_at: ops.notice.expires_at } : null,
      consent: consentOf(me.data),
      tabletalk: tt ? { version: tt.version as number, table_no: tt.table_no as number, seat_no: (tt.seat_no as number | null) ?? null } : null,
      coffeechat: cc ? { version: cc.version as number, group_no: cc.table_no as number } : null,
      published: { tabletalk: pub("tabletalk"), coffeechat: pub("coffeechat") },
      recs_open: recsOpen(ops.phase),
      mission: { window, done_count: m.done_count, total: m.total, progress: m.progress },
      now: new Date().toISOString(),
    });
  });
}
