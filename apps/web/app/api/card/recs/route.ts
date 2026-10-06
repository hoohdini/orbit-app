// GET /api/card/recs  오늘 만나면 좋을 분(개발 지시서 v0.2 H-04, 결정 13). 명함 탭에서 한 번에 3명.
// 목록은 계산 서비스가 미리 만든 recs(B-06)를 쓰고 여기서는 거르기만 한다. 커피챗 배정이 공개되면 그 버전 목록, 전이면 테이블토크(전날 계산) 버전 목록.
// 거르기: 이미 교환한 사람(확인 대기 포함), 테이블토크 · 커피챗 동석자, 체크인하지 않은 사람, 동의 거부자.
// 쏠림 방지: 최근 10분 동안 명함을 3건 이상 받은 사람은 목록 뒤로 보낸다. 이미 내 화면에 떴던 사람은 그대로 둔다.
// 보여 준 사람은 rec_impressions 에 처음 시각만 남긴다(미션 ② 판정). 순위 · 점수 · 근거는 내보내지 않는다.
// 단계가 tabletalk · tabletalk_end · coffeechat_seated 이면 접는다(folded, 빈 목록).
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { collectGuard, refusedAmong } from "@/lib/consent";
import { opsSnapshot } from "@/lib/opsState";
import { recsOpen } from "@/lib/phase";
import { firstSentence } from "@/lib/text";

export const dynamic = "force-dynamic";

const SHOW = 3;
const HOT_WINDOW_MIN = 10;
const HOT_MIN = 3;

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const guard = await collectGuard(s.pid);
    if (guard) return guard;

    const ops = await opsSnapshot();
    if (!recsOpen(ops.phase)) return ok({ folded: true, people: [], almost_done: false });

    const { data: vers, error: vErr } = await db()
      .from("assign_versions")
      .select("version, round")
      .eq("event_id", eventId())
      .eq("status", "published")
      .order("version", { ascending: false });
    if (vErr) throw vErr;
    const version = ((vers ?? []).find((v) => v.round === "coffeechat") ?? (vers ?? []).find((v) => v.round === "tabletalk"))?.version as number | undefined;
    if (!version) return ok({ folded: false, people: [], almost_done: false });

    const [recRes, exRes, mateRes, impRes] = await Promise.all([
      db().from("recs").select("rank, target_id").eq("version", version).eq("participant_id", s.pid).order("rank"),
      db().from("card_exchanges").select("scanned_id").eq("scanner_id", s.pid),
      db().from("current_tables").select("round, table_no").eq("participant_id", s.pid).eq("event_id", eventId()),
      db().from("rec_impressions").select("target_id").eq("participant_id", s.pid),
    ]);
    for (const r of [recRes, exRes, mateRes, impRes]) if (r.error) throw r.error;

    const exclude = new Set<string>([s.pid, ...(exRes.data ?? []).map((r) => r.scanned_id as string)]);
    for (const m of mateRes.data ?? []) {
      const { data, error } = await db().from("current_tables").select("participant_id").eq("event_id", eventId()).eq("round", m.round).eq("table_no", m.table_no);
      if (error) throw error;
      for (const r of data ?? []) exclude.add(r.participant_id as string);
    }

    let candidates = Array.from(new Set((recRes.data ?? []).map((r) => r.target_id as string))).filter((id) => !exclude.has(id));
    if (candidates.length > 0) {
      const [ci, refused] = await Promise.all([
        db().from("checkins").select("participant_id").in("participant_id", candidates),
        refusedAmong(candidates),
      ]);
      if (ci.error) throw ci.error;
      const checked = new Set((ci.data ?? []).map((c) => c.participant_id as string));
      candidates = candidates.filter((id) => checked.has(id) && !refused.has(id));
    }

    // 쏠림 방지. 받은 교환 = 남이 그 사람을 찍은 행(source qr · manual)
    const seen = new Set((impRes.data ?? []).map((r) => r.target_id as string));
    if (candidates.length > SHOW) {
      const since = new Date(Date.now() - HOT_WINDOW_MIN * 60_000).toISOString();
      const { data: recent, error } = await db()
        .from("card_exchanges")
        .select("scanned_id")
        .in("scanned_id", candidates)
        .neq("source", "auto")
        .eq("status", "confirmed")
        .gte("created_at", since);
      if (error) throw error;
      const got = new Map<string, number>();
      for (const r of recent ?? []) got.set(r.scanned_id as string, (got.get(r.scanned_id as string) ?? 0) + 1);
      const hot = (id: string) => (got.get(id) ?? 0) >= HOT_MIN && !seen.has(id);
      candidates = [...candidates.filter((id) => !hot(id)), ...candidates.filter(hot)];
    }

    const pick = candidates.slice(0, SHOW);
    if (pick.length === 0) return ok({ folded: false, people: [], almost_done: true });

    const [people, profiles] = await Promise.all([
      db().from("participants").select("id, display_name, affiliation, role, cohort").in("id", pick),
      db().from("profiles").select("participant_id, offer_text").in("participant_id", pick),
    ]);
    if (people.error) throw people.error;
    if (profiles.error) throw profiles.error;
    const personOf = new Map((people.data ?? []).map((p) => [p.id as string, p]));
    const offerOf = new Map((profiles.data ?? []).map((p) => [p.participant_id as string, (p.offer_text as string) ?? ""]));

    const fresh = pick.filter((id) => !seen.has(id));
    if (fresh.length > 0) {
      const { error } = await db()
        .from("rec_impressions")
        .upsert(fresh.map((target_id) => ({ participant_id: s.pid, target_id, version })), { onConflict: "participant_id,target_id", ignoreDuplicates: true });
      if (error) throw error;
    }

    return ok({
      folded: false,
      people: pick.map((id) => {
        const p = personOf.get(id);
        return {
          id,
          display_name: (p?.display_name as string) ?? "",
          affiliation: (p?.affiliation as string | null) ?? null,
          role: (p?.role as string) ?? "",
          cohort: (p?.cohort as number | null) ?? null,
          career_line: firstSentence(offerOf.get(id)),
        };
      }),
      // 남은 후보가 3명 미만이면 오늘 거의 다 만나셨어요
      almost_done: candidates.length < SHOW,
    });
  });
}
