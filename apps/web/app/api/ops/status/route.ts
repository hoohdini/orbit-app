// GET /api/ops/status  운영 콘솔 상태판. 이 행사(EVENT_ID)의 체크인 · 만족도 응답률 · 명함 교환 · 계산 서비스 생존 신호 · 라운드별 공개 버전
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { eventParticipantIds, countIn, opsGet, ROUNDS } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const ev = eventId();
    const ids = await eventParticipantIds();

    const [checkins, satisfaction, exchangeRows, heartbeat, phase, published] = await Promise.all([
      countIn("checkins", "participant_id", ids),
      countIn("satisfaction", "participant_id", ids, ["round", "tabletalk"]),
      countIn("card_exchanges", "scanner_id", ids),
      opsGet<{ at: string; last: string }>("compute_heartbeat"),
      opsGet<string>("phase"),
      db().from("assign_versions").select("round, version, published_at").eq("event_id", ev).eq("status", "published").order("version", { ascending: false }),
    ]);
    if (published.error) throw published.error;

    const pub: Record<string, { version: number; published_at: string | null } | null> = {};
    for (const r of ROUNDS) {
      const row = (published.data ?? []).find((v) => v.round === r);
      pub[r] = row ? { version: row.version as number, published_at: row.published_at as string | null } : null;
    }

    return ok({
      event_id: ev,
      phase,
      participants: ids.length,
      checkins,
      satisfaction: { answered: satisfaction, rate: checkins > 0 ? Math.round((satisfaction / checkins) * 1000) / 1000 : null },
      exchanges: Math.floor(exchangeRows / 2), // 한 번 찍으면 두 행(양방향)이라 건수는 행 수의 절반
      compute_heartbeat: heartbeat,
      published: pub,
      now: new Date().toISOString(),
    });
  });
}
