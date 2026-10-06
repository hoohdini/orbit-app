// GET /api/ops/versions/<version>  배정 버전 하나의 테이블별 구성원과 사람별 배정 이유 (운영자 전용, 담당: 민찬)
// 공개하기 전에 운영진이 배정을 확인하는 데 쓴다(9/27 회의: 운영진 더블체크). 이유는 계산 서비스가 table_members.reason 에 남긴 것이다.
// 개발 지시서 v0.2 A-03: metrics(그룹 수 · 크기, 재회 쌍, 기수 초과, 체크인 안 한 사람, 평균 점수)와 테이블별 평균 점수 · 검수 표시(check)를 붙인다.
// 점수는 그 버전에 저장된 쌍 점수(pair_scores) 기준이다. 참가자 화면에는 나가지 않는다.
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { pairScores, groupMean } from "@/lib/pairs";

// 같은 기수 상한. 계산 서비스(services/compute/service.py TABLETALK_COHORT_CAP · COFFEECHAT_COHORT_CAP, 10/5)와 같은 값이다
const COHORT_CAP: Record<string, number> = { tabletalk: 3, coffeechat: 2 };

export const dynamic = "force-dynamic";

type Reason = { text?: string; random?: boolean } | null;

export async function GET(_req: Request, { params }: { params: Promise<{ version: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const version = Number.parseInt((await params).version, 10);
    if (!Number.isFinite(version)) return fail("BAD_INPUT", "버전 번호가 아니다", 400);

    const { data: v, error: vErr } = await db()
      .from("assign_versions")
      .select("version, round, status")
      .eq("version", version)
      .eq("event_id", eventId())
      .maybeSingle();
    if (vErr) throw vErr;
    if (!v) return fail("NOT_FOUND", "이 행사의 배정 버전이 아니다", 404);

    const { data: rows, error } = await db()
      .from("table_members")
      .select("table_no, participant_id, reason, seat_no")
      .eq("version", version)
      .order("table_no");
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.participant_id as string);
    const { data: people, error: pErr } = ids.length
      ? await db().from("participants").select("id, display_name, affiliation, role, cohort").in("id", ids)
      : { data: [], error: null };
    if (pErr) throw pErr;
    const who = new Map((people ?? []).map((p) => [p.id as string, p]));

    type Row = { id: string; display_name: string; affiliation: string | null; role: string; cohort: number | null; seat_no: number | null; random: boolean; reason: string };
    const tables = new Map<number, { table_no: number; mean_score: number | null; check: boolean; members: Row[] }>();
    for (const r of rows ?? []) {
      const t = r.table_no as number;
      if (!tables.has(t)) tables.set(t, { table_no: t, mean_score: null, check: false, members: [] });
      const p = who.get(r.participant_id as string);
      const reason = r.reason as Reason;
      tables.get(t)!.members.push({
        id: r.participant_id as string,
        display_name: (p?.display_name as string) ?? "",
        affiliation: (p?.affiliation as string | null) ?? null,
        role: (p?.role as string) ?? "",
        cohort: (p?.cohort as number | null) ?? null,
        seat_no: (r.seat_no as number | null) ?? null,
        random: !!reason?.random,
        reason: reason?.text ?? "",
      });
    }
    // 지표
    const list = [...tables.values()];
    const score = await pairScores(version);
    for (const t of list) {
      const m = groupMean(t.members.map((x) => x.id), score);
      t.mean_score = m === null ? null : Math.round(m * 1000) / 1000;
      t.members.sort((a, b) => (a.seat_no ?? 999) - (b.seat_no ?? 999));
    }
    const means = list.map((t) => t.mean_score).filter((x): x is number => x !== null);
    const avg = means.length ? means.reduce((a, b) => a + b, 0) / means.length : null;
    const sd = means.length ? Math.sqrt(means.reduce((a, b) => a + (b - avg!) ** 2, 0) / means.length) : 0;
    // 검수 표시: 평균보다 1 표준편차 넘게 낮은 테이블. 없으면 가장 낮은 하나
    for (const t of list) t.check = avg !== null && t.mean_score !== null && t.mean_score < avg - sd;
    if (!list.some((t) => t.check) && means.length > 1) {
      const low = list.filter((t) => t.mean_score !== null).sort((a, b) => a.mean_score! - b.mean_score!)[0];
      if (low) low.check = true;
    }

    let cohortOver = 0;
    for (const t of list) {
      const cap = COHORT_CAP[v.round as string] ?? 3;
      const cnt = new Map<number, number>();
      for (const x of t.members) if (x.cohort !== null) cnt.set(x.cohort, (cnt.get(x.cohort) ?? 0) + 1);
      for (const c of cnt.values()) cohortOver += Math.max(0, c - cap);
    }

    // 재회 쌍: 커피챗 그룹 안에서 공개된 테이블토크 때 같은 테이블이었던 쌍
    let reunion: number | null = null;
    if (v.round === "coffeechat") {
      const { data: tt, error: tErr } = await db().from("current_tables").select("participant_id, table_no").eq("round", "tabletalk").eq("event_id", eventId());
      if (tErr) throw tErr;
      const ttOf = new Map((tt ?? []).map((r) => [r.participant_id as string, r.table_no as number]));
      reunion = 0;
      for (const t of list)
        for (let i = 0; i < t.members.length; i++)
          for (let j = i + 1; j < t.members.length; j++) {
            const a = ttOf.get(t.members[i].id);
            if (a !== undefined && a === ttOf.get(t.members[j].id)) reunion++;
          }
    }

    const { data: ci, error: ciErr } = ids.length ? await db().from("checkins").select("participant_id").in("participant_id", ids) : { data: [], error: null };
    if (ciErr) throw ciErr;
    const sizes = list.map((t) => t.members.length);

    return ok({
      version: v.version,
      round: v.round,
      status: v.status,
      metrics: {
        groups: list.length,
        sizes,
        size_min: sizes.length ? Math.min(...sizes) : 0,
        size_max: sizes.length ? Math.max(...sizes) : 0,
        mean_score: avg === null ? null : Math.round(avg * 1000) / 1000,
        low_score: means.length ? Math.round(Math.min(...means) * 1000) / 1000 : null,
        check_tables: list.filter((t) => t.check).map((t) => t.table_no),
        reunion_pairs: reunion,
        cohort_over: cohortOver,
        not_checked_in: ids.length - (ci ?? []).length,
      },
      tables: list,
    });
  });
}
