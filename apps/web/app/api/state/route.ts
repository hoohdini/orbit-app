// GET /api/state  참가자 화면이 15초마다 부르는 상태 하나(개발 지시서 v0.2 B-09).
// 전역 상태 띠(H-01), 추천 접힘(H-04), 만족도 노출(N-03), 새 배정 안내(N-06), 미션 현황(E-01)이 이것만 본다.
import { db } from "@/lib/db";
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { consentOf, shareOf } from "@/lib/consent";
import { opsSnapshot } from "@/lib/opsState";
import { phaseLabel, recsOpen, missionWindow, MISSION_CLOSED } from "@/lib/phase";
import { seatLateCoffeechat } from "@/lib/coffeechatLate";
import { missionStatus } from "@/lib/missions";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const [me, ops, mine, published] = await Promise.all([
      db().from("participants").select("consent_at, consent_refused_at, share_consent_at, share_refused_at").eq("id", s.pid).maybeSingle(),
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
    const pub = (round: string) => ((published.data ?? []).find((v) => v.round === round)?.version as number | undefined) ?? null;
    // 커피챗 계산 뒤 · 공개 전에 들어와 공개된 커피챗에 자리가 없는 사람은 여기서 앉힌다(10/25, 구현하며 정함. 로그인 때는 아직 공개 전이라 못 앉혔다)
    let cc: { version: unknown; table_no: unknown; seat_no: unknown } | undefined = seat("coffeechat");
    if (!cc && pub("coffeechat") !== null && !(ops.phase && MISSION_CLOSED.includes(ops.phase))) {
      const late = await seatLateCoffeechat(s.pid);
      if (late) cc = late;
    }
    const window = missionWindow(ops.phase);
    const m = await missionStatus(s.pid, ops.missionClosedAt);

    return ok({
      phase: ops.phase,
      phase_label: phaseLabel(ops.phase),
      phase_at: ops.phaseMeta?.at ?? null,
      notice: ops.notice ? { text: ops.notice.text, expires_at: ops.notice.expires_at } : null,
      consent: consentOf(me.data),
      share: shareOf(me.data), // 명함 공개 및 추천 활용(0014)
      tabletalk: tt ? { version: tt.version as number, table_no: tt.table_no as number, seat_no: (tt.seat_no as number | null) ?? null } : null,
      coffeechat: cc ? { version: cc.version as number, group_no: cc.table_no as number, seat_no: (cc.seat_no as number | null) ?? null } : null, // 커피챗 좌석은 10/23 부터(예전 버전은 null)
      published: { tabletalk: pub("tabletalk"), coffeechat: pub("coffeechat") },
      recs_open: recsOpen(ops.phase),
      mission: { window, done_count: m.done_count, total: m.total, progress: m.progress },
      now: new Date().toISOString(),
    });
  });
}
