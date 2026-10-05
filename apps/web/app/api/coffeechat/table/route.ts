// GET /api/coffeechat/table  내 커피챗 첫 배치 그룹(개발 지시서 v0.2 N-04, 3~4명)과 구성원 카드
// 카드 = 이름 · 기수 · 소속 · 이력 한 줄(지금 하는 일의 첫 문장) · 근거 한 줄(B-07, 없으면 null).
// 근거는 계산 서비스가 배정 때 만들어 group_reasons 에 넣어 둔 것을 그대로 준다(현장에서 만들지 않는다). 점수 · 순위는 주지 않는다.
// table_no 와 group_no 는 같은 값이다(예전 화면 호환). talk_prompts(대화거리)는 v0.2 에서 화면에서 빼기로 해 예전 화면용으로만 남긴다.
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getMyTable } from "@/lib/participants";
import { firstSentence } from "@/lib/text";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

type Member = {
  id: string;
  display_name: string;
  affiliation: string | null;
  role: string;
  cohort: number | null;
  topic_tags: string[];
  career_line: string;
  offer_text: string;
  reason: string | null;
};

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const mine = await getMyTable(s.pid, "coffeechat");
    if (!mine) return fail("NOT_PUBLISHED", "커피챗 배정이 아직 공개되지 않았다", 404);

    const [rows, meta, reasons] = await Promise.all([
      db()
        .from("current_tables")
        .select("participant_id")
        .eq("round", "coffeechat")
        .eq("version", mine.version)
        .eq("table_no", mine.table_no),
      db().from("tables_meta").select("talk_prompts").eq("version", mine.version).eq("table_no", mine.table_no).maybeSingle(),
      db().from("group_reasons").select("target_id, text").eq("version", mine.version).eq("participant_id", s.pid),
    ]);
    if (rows.error) throw rows.error;
    if (meta.error) throw meta.error;
    if (reasons.error) throw reasons.error;
    const ids = (rows.data ?? []).map((r) => r.participant_id as string);
    const reasonOf = new Map((reasons.data ?? []).map((r) => [r.target_id as string, r.text as string]));

    const [people, profiles] = await Promise.all([
      db().from("participants").select("id, display_name, affiliation, role, cohort").in("id", ids),
      db().from("profiles").select("participant_id, topic_tags, offer_text").in("participant_id", ids),
    ]);
    if (people.error) throw people.error;
    if (profiles.error) throw profiles.error;

    const profileOf = new Map((profiles.data ?? []).map((p) => [p.participant_id as string, p]));
    const members: Member[] = (people.data ?? []).map((p) => {
      const prof = profileOf.get(p.id as string);
      const offer = (prof?.offer_text as string) ?? "";
      return {
        id: p.id as string,
        display_name: p.display_name as string,
        affiliation: p.affiliation as string | null,
        role: p.role as string,
        cohort: (p.cohort as number | null) ?? null,
        topic_tags: (prof?.topic_tags as string[]) ?? [],
        career_line: firstSentence(offer),
        offer_text: offer,
        reason: p.id === s.pid ? null : reasonOf.get(p.id as string) ?? null,
      };
    });
    members.sort((a, b) => (a.id === s.pid ? -1 : b.id === s.pid ? 1 : a.display_name.localeCompare(b.display_name, "ko")));

    await logEvent("open_coffeechat", s.pid);
    return ok({
      group_no: mine.table_no,
      table_no: mine.table_no,
      label: mine.label,
      talk_prompts: (meta.data?.talk_prompts as string[]) ?? [],
      members,
    });
  });
}
