// GET /api/state  참가자 화면이 15초마다 부르는 상태 하나(개발 지시서 v0.2 B-09).
// 전역 상태 띠(H-01), 추천 접힘(H-04), 만족도 노출(N-03), 새 배정 안내(N-06), 미션 현황(E-01)이 이것만 본다.
import { db } from "@/lib/db";
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { consentOf, shareOf } from "@/lib/consent";
import { opsSnapshot } from "@/lib/opsState";
import { phaseLabel, recsOpen, missionWindow, leaveOpen, MISSION_CLOSED } from "@/lib/phase";
import { seatLateCoffeechat } from "@/lib/coffeechatLate";
import { missionStatus } from "@/lib/missions";
import { myCheckin } from "@/lib/checkinLeft";
import { ensureCheckin } from "@/lib/participants";
import { checkinOpenAt } from "@/lib/eventDay";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const [me, ops, mine, published, ck] = await Promise.all([
      db().from("participants").select("consent_at, consent_refused_at, share_consent_at, share_refused_at").eq("id", s.pid).maybeSingle(),
      opsSnapshot(),
      db().from("current_tables").select("round, version, table_no, seat_no").eq("participant_id", s.pid).eq("event_id", eventId()),
      db().from("assign_versions").select("round, version").eq("event_id", eventId()).eq("status", "published").order("version", { ascending: false }),
      myCheckin(s.pid), // 조기 퇴장 표시(0019, 10/25 민찬 결정). 0019 전 DB 면 left_at null 로 계속 돈다
    ]);
    if (me.error) throw me.error;
    if (!me.data) return fail("NOT_FOUND", "참가자를 찾을 수 없다", 404);
    if (mine.error) throw mine.error;
    if (published.error) throw published.error;
    const leftAt = ck.left_at;
    // 행사 전 · 리허설에 로그인해 둔 사람은 다시 로그인하지 않으므로 등록 · 개회 ~ 커피챗 사이(운영진이 오늘 단계를 연 뒤)에는 여기서 체크인한다
    //   (10/30 민찬 결정 · 코드리뷰). 마무리 · 시상 때 처음 연 사람은 체크인하지 않는다. 실패해도 상태는 돌려준다
    let checkedIn = ck.checked_in;
    let newSeat: Awaited<ReturnType<typeof ensureCheckin>> = null;
    if (!checkedIn && leaveOpen(ops.phase) && checkinOpenAt(ops.phase, ops.phaseMeta?.at)) {
      try {
        newSeat = await ensureCheckin(s.pid);
        checkedIn = true;
      } catch {}
    }

    const seat = (round: string) => (mine.data ?? []).find((r) => r.round === round);
    const tt = seat("tabletalk");
    const pub = (round: string) => ((published.data ?? []).find((v) => v.round === round)?.version as number | undefined) ?? null;
    // 커피챗 계산 뒤 · 공개 전에 들어와 공개된 커피챗에 자리가 없는 사람은 여기서 앉힌다(10/25, 구현하며 정함 · 10/25 민찬 확정. 로그인 때는 아직 공개 전이라 못 앉혔다). 이미 앉은 사람은 추가 쿼리가 없다
    let cc: { version: unknown; table_no: unknown; seat_no: unknown } | undefined = seat("coffeechat") ?? newSeat ?? undefined;
    // 일찍 나간다고 표시한 사람은 앉히지 않는다(10/25 민찬 결정). 되돌리면 다음 폴링에서 앉는다
    if (!cc && !leftAt && pub("coffeechat") !== null && !(ops.phase && MISSION_CLOSED.includes(ops.phase))) {
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
      checked_in: checkedIn, // 운영진이 오늘 단계를 연 뒤 첫 로그인 · 상태 조회가 체크인. 조기 퇴장 버튼은 체크인한 사람에게만
      left_at: leftAt, // 조기 퇴장을 누른(또는 운영자가 나감 표시한) 시각. null 이면 행사장에 있음(0019). 화면은 재입장을 보인다
      leave_open: leaveOpen(ops.phase), // 조기 퇴장 · 재입장을 받는 단계인지(등록 · 개회 ~ 커피챗)
      leave_available: !ck.legacy, // DB 에 0019(left_at 칸)가 있는지. false 면 화면이 버튼을 숨긴다
      mission: { window, done_count: m.done_count, total: m.total, progress: m.progress },
      now: new Date().toISOString(),
    });
  });
}
