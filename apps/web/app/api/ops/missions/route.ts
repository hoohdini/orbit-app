// GET /api/ops/missions  이벤트 · 미션 · 시상 현황(개발 지시서 v0.2 A-07, 결정 12). 운영자만.
// 체크인한 사람 기준 미션 평균 진행도, 4/4 완료자 수, 미션별 완료자 수, 특별 시상 후보(제외 명단을 뺀 상위 20명), QR 처리 수와 탭 불일치 수.
// 시상 순서: 진행도 높은 순 → 유효 포스터 응답 수(5초 이상) → 첫 대화로 체크한 확인 교환 수 → 4/4 완료 시각 이른 순.
// 전체 교환 수는 쓰지 않는다(명찰 QR 을 찍기만 해도 늘어서). 제외 명단(현장 운영진, 모델링팀)은 /api/ops/award-exclude 로 올린다.
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { opsSnapshot } from "@/lib/opsState";
import { missionWindow } from "@/lib/phase";
import { MISSIONS, missionStatuses, checkedInIds, type MissionStatus } from "@/lib/missions";
import { opsGet, eventParticipantIds } from "../_lib";

export const dynamic = "force-dynamic";

const TOP = 20;

function awardOrder(a: [string, MissionStatus], b: [string, MissionStatus]): number {
  const [, x] = a;
  const [, y] = b;
  return (
    y.progress - x.progress ||
    y.tiebreak.valid_poster_responses - x.tiebreak.valid_poster_responses ||
    y.tiebreak.first_meet_exchanges - x.tiebreak.first_meet_exchanges ||
    (x.completed_all_at ?? "9").localeCompare(y.completed_all_at ?? "9")
  );
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const ev = eventId();
    const [ops, ids, excluded] = await Promise.all([opsSnapshot(), checkedInIds(ev), opsGet<{ ids: string[] }>("award_excluded")]);
    const stat = await missionStatuses(ids, ops.missionClosedAt);
    const rows = [...stat.entries()];
    const skip = new Set(excluded?.ids ?? []);

    const people = ids.length ? await db().from("participants").select("id, display_name, affiliation, role").in("id", ids) : { data: [], error: null };
    if (people.error) throw people.error;
    const who = new Map((people.data ?? []).map((p) => [p.id as string, p]));

    const candidates = rows
      .filter(([id, m]) => !skip.has(id) && m.progress > 0)
      .sort(awardOrder)
      .slice(0, TOP)
      .map(([id, m], i) => ({
        place: i + 1,
        id,
        display_name: (who.get(id)?.display_name as string) ?? "",
        affiliation: (who.get(id)?.affiliation as string | null) ?? null,
        progress: m.progress,
        done_count: m.done_count,
        valid_poster_responses: m.tiebreak.valid_poster_responses,
        first_meet_exchanges: m.tiebreak.first_meet_exchanges,
        completed_all_at: m.completed_all_at,
      }));

    // QR 처리 수와 탭 불일치 수. 명함 QR 을 이벤트 탭에서, 포스터 QR 을 명함 탭에서 읽은 경우가 불일치다
    const all = await eventParticipantIds();
    const scans = await db().from("event_log").select("kind, payload").in("kind", ["card_scan", "poster_scan"]).in("participant_id", all);
    if (scans.error) throw scans.error;
    const list = scans.data ?? [];
    const mismatch = list.filter((r) => {
      const via = (r.payload as { via?: string } | null)?.via;
      return (r.kind === "card_scan" && via === "event") || (r.kind === "poster_scan" && via === "card");
    }).length;

    const n = rows.length;
    return ok({
      window: missionWindow(ops.phase),
      closed_at: ops.missionClosedAt,
      checked_in: n,
      avg_progress: n ? Math.round((rows.reduce((s, [, m]) => s + m.progress, 0) / n) * 1000) / 1000 : null,
      completed_all: rows.filter(([, m]) => m.done_count === m.total).length,
      by_mission: MISSIONS.map((ms) => ({ key: ms.key, label: ms.label, done: rows.filter(([, m]) => m.missions.find((x) => x.key === ms.key)?.done).length })),
      excluded: skip.size,
      candidates,
      qr: { card_scans: list.filter((r) => r.kind === "card_scan").length, poster_scans: list.filter((r) => r.kind === "poster_scan").length, tab_mismatch: mismatch },
    });
  });
}
