// GET /api/card/recs  오늘 만나면 좋을 분(개발 지시서 v0.2 H-04, 결정 13). 명함 탭에서 10명을 번호 목록으로.
// 10/10 전체 회의: 행사 전에 정한 10명(계산 서비스 B-06, 정확 8 + 탐색 2)을 행사 내내 그대로 보여 준다.
// 목록 버전: 행사 직후 추천(커피챗 라운드 params.kind = final)이 공개됐으면 그 버전, 아니면 공개된 테이블토크(전날 계산) 버전.
//   보통 커피챗 계산 목록은 쓰지 않는다(행사 중에 바뀌지 않게).
// 번호(rank)는 가까운 순서다(10/11 성하 결정: 번호를 보여 준다). 계산 서비스의 순위를 1부터 다시 매긴 값이고 점수 · 근거는 내보내지 않는다.
// 목록에서 빼는 사람은 본인과 동의 거부자뿐이다. 이미 교환한 사람은 exchanged, 체크인하지 않은 사람은 checked_in false 로 표시만 한다.
// offer_text 는 하는 일 원문이다(10/11 성하 결정: 원문을 보여 주고 나중에 고친다).
// 보여 준 사람은 rec_impressions 에 처음 시각만 남긴다(미션 ③ 추천 인물 판정).
// 단계가 tabletalk · tabletalk_end · coffeechat_seated 이면 접는다(folded, 빈 목록).
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { collectGuard, refusedAmong } from "@/lib/consent";
import { opsSnapshot } from "@/lib/opsState";
import { recsOpen } from "@/lib/phase";
import { firstSentence } from "@/lib/text";

export const dynamic = "force-dynamic";

const SHOW = 10;

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const guard = await collectGuard(s.pid);
    if (guard) return guard;

    const ops = await opsSnapshot();
    if (!recsOpen(ops.phase)) return ok({ folded: true, version: null, people: [], almost_done: false });

    const { data: vers, error: vErr } = await db()
      .from("assign_versions")
      .select("version, round, params")
      .eq("event_id", eventId())
      .eq("status", "published")
      .order("version", { ascending: false });
    if (vErr) throw vErr;
    const list = vers ?? [];
    const finalVer = list.find((v) => v.round === "coffeechat" && (v.params as { kind?: string } | null)?.kind === "final");
    const version = (finalVer ?? list.find((v) => v.round === "tabletalk"))?.version as number | undefined;
    if (!version) return ok({ folded: false, version: null, people: [], almost_done: false });

    const [recRes, exRes, impRes] = await Promise.all([
      db().from("recs").select("rank, target_id").eq("version", version).eq("participant_id", s.pid).order("rank"),
      db().from("card_exchanges").select("scanned_id").eq("scanner_id", s.pid),
      db().from("rec_impressions").select("target_id").eq("participant_id", s.pid),
    ]);
    for (const r of [recRes, exRes, impRes]) if (r.error) throw r.error;

    let ids = Array.from(new Set((recRes.data ?? []).map((r) => r.target_id as string))).filter((id) => id !== s.pid);
    if (ids.length > 0) {
      const refused = await refusedAmong(ids);
      ids = ids.filter((id) => !refused.has(id));
    }
    ids = ids.slice(0, SHOW);
    if (ids.length === 0) return ok({ folded: false, version, people: [], almost_done: false });

    const [people, profiles, ci] = await Promise.all([
      db().from("participants").select("id, display_name, affiliation, role, cohort").in("id", ids),
      db().from("profiles").select("participant_id, offer_text").in("participant_id", ids),
      db().from("checkins").select("participant_id").in("participant_id", ids),
    ]);
    if (people.error) throw people.error;
    if (profiles.error) throw profiles.error;
    if (ci.error) throw ci.error;
    const personOf = new Map((people.data ?? []).map((p) => [p.id as string, p]));
    const offerOf = new Map((profiles.data ?? []).map((p) => [p.participant_id as string, (p.offer_text as string) ?? ""]));
    const checked = new Set((ci.data ?? []).map((c) => c.participant_id as string));
    const exchanged = new Set((exRes.data ?? []).map((r) => r.scanned_id as string));

    const seen = new Set((impRes.data ?? []).map((r) => r.target_id as string));
    const fresh = ids.filter((id) => !seen.has(id));
    if (fresh.length > 0) {
      const { error } = await db()
        .from("rec_impressions")
        .upsert(fresh.map((target_id) => ({ participant_id: s.pid, target_id, version })), { onConflict: "participant_id,target_id", ignoreDuplicates: true });
      if (error) throw error;
    }

    return ok({
      folded: false,
      version,
      people: ids.map((id, i) => {
        const p = personOf.get(id);
        const offer = offerOf.get(id) ?? "";
        return {
          rank: i + 1,
          id,
          display_name: (p?.display_name as string) ?? "",
          affiliation: (p?.affiliation as string | null) ?? null,
          role: (p?.role as string) ?? "",
          cohort: (p?.cohort as number | null) ?? null,
          career_line: firstSentence(offer),
          offer_text: offer,
          exchanged: exchanged.has(id),
          checked_in: checked.has(id),
        };
      }),
      // 목록의 모든 분과 교환했으면 오늘 거의 다 만나셨어요
      almost_done: ids.every((id) => exchanged.has(id)),
    });
  });
}
