// GET /api/ops/status  운영 콘솔 상태판. 이 행사(EVENT_ID)의 체크인 · 만족도 응답률 · 명함 교환 · 계산 서비스 생존 신호 · 라운드별 공개 버전
// 개발 지시서 v0.2 A-01: 단계와 단계 바뀐 시각, 라운드별 응답률(무응답률은 1 - rate), 쏠림 지표 두 개(받은 교환 수의 지니 계수, 한 건도 받지 못한 사람 수).
// 교환은 성립한 것(confirmed)만 센다. 받은 교환 = 남이 그 사람을 찍은 행(source qr · manual)
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { eventParticipantIds, countIn, opsGet, selectIn, ROUNDS } from "../_lib";
import { phaseLabel, isPhase } from "@/lib/phase";

// 0 = 고르게 받음, 1 = 한 사람이 다 받음
function gini(xs: number[]): number | null {
  const n = xs.length;
  const sum = xs.reduce((a, b) => a + b, 0);
  if (n === 0 || sum === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const weighted = a.reduce((acc, x, i) => acc + (i + 1) * x, 0);
  return Math.round(((2 * weighted) / (n * sum) - (n + 1) / n) * 1000) / 1000;
}

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const ev = eventId();
    const ids = await eventParticipantIds();

    const [checkins, satisfaction, satCoffee, exchangeRows, heartbeat, phase, phaseMeta, published, checkedRows, scannedRows] = await Promise.all([
      countIn("checkins", "participant_id", ids),
      countIn("satisfaction", "participant_id", ids, ["round", "tabletalk"]),
      countIn("satisfaction", "participant_id", ids, ["round", "coffeechat"]),
      countIn("card_exchanges", "scanner_id", ids, ["status", "confirmed"]),
      opsGet<{ at: string; last: string }>("compute_heartbeat"),
      opsGet<string>("phase"),
      opsGet<{ at: string; by: string }>("phase_meta"),
      db().from("assign_versions").select("round, version, published_at").eq("event_id", ev).eq("status", "published").order("version", { ascending: false }),
      selectIn<{ participant_id: string }>("checkins", "participant_id", "participant_id", ids),
      selectIn<{ scanned_id: string; source: string; status: string }>("card_exchanges", "scanned_id, source, status", "scanned_id", ids),
    ]);
    if (published.error) throw published.error;

    const received = new Map<string, number>(checkedRows.map((r) => [r.participant_id, 0]));
    for (const r of scannedRows) {
      if (r.source === "auto" || r.status !== "confirmed" || !received.has(r.scanned_id)) continue;
      received.set(r.scanned_id, received.get(r.scanned_id)! + 1);
    }
    const rate = (n: number) => (checkins > 0 ? Math.round((n / checkins) * 1000) / 1000 : null);

    const pub: Record<string, { version: number; published_at: string | null } | null> = {};
    for (const r of ROUNDS) {
      const row = (published.data ?? []).find((v) => v.round === r);
      pub[r] = row ? { version: row.version as number, published_at: row.published_at as string | null } : null;
    }

    return ok({
      event_id: ev,
      phase,
      phase_label: isPhase(phase) ? phaseLabel(phase) : null,
      phase_at: phaseMeta?.at ?? null,
      participants: ids.length,
      checkins,
      satisfaction: { answered: satisfaction, rate: rate(satisfaction) },
      satisfaction_by_round: { tabletalk: { answered: satisfaction, rate: rate(satisfaction) }, coffeechat: { answered: satCoffee, rate: rate(satCoffee) } },
      skew: { gini: gini([...received.values()]), zero_received: [...received.values()].filter((v) => v === 0).length },
      exchanges: Math.floor(exchangeRows / 2), // 한 번 찍으면 두 행(양방향)이라 건수는 행 수의 절반
      compute_heartbeat: heartbeat,
      published: pub,
      now: new Date().toISOString(),
    });
  });
}
