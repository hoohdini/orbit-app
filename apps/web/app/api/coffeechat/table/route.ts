// GET /api/coffeechat/table  내 커피챗 배정, 대화거리, 같은 테이블 구성원 소개
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getMyTable } from "@/lib/participants";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

type Member = { id: string; display_name: string; affiliation: string | null; topic_tags: string[]; offer_text: string };

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const mine = await getMyTable(s.pid, "coffeechat");
    if (!mine) return fail("NOT_PUBLISHED", "커피챗 배정이 아직 공개되지 않았다", 404);

    const [rows, meta] = await Promise.all([
      db()
        .from("current_tables")
        .select("participant_id")
        .eq("round", "coffeechat")
        .eq("version", mine.version)
        .eq("table_no", mine.table_no),
      db().from("tables_meta").select("talk_prompts").eq("version", mine.version).eq("table_no", mine.table_no).maybeSingle(),
    ]);
    if (rows.error) throw rows.error;
    if (meta.error) throw meta.error;
    const ids = (rows.data ?? []).map((r) => r.participant_id as string);

    const [people, profiles] = await Promise.all([
      db().from("participants").select("id, display_name, affiliation").in("id", ids),
      db().from("profiles").select("participant_id, topic_tags, offer_text").in("participant_id", ids),
    ]);
    if (people.error) throw people.error;
    if (profiles.error) throw profiles.error;

    const profileOf = new Map((profiles.data ?? []).map((p) => [p.participant_id as string, p]));
    const members: Member[] = (people.data ?? []).map((p) => {
      const prof = profileOf.get(p.id as string);
      return {
        id: p.id as string,
        display_name: p.display_name as string,
        affiliation: p.affiliation as string | null,
        topic_tags: (prof?.topic_tags as string[]) ?? [],
        offer_text: (prof?.offer_text as string) ?? "",
      };
    });
    members.sort((a, b) => (a.id === s.pid ? -1 : b.id === s.pid ? 1 : a.display_name.localeCompare(b.display_name, "ko")));

    await logEvent("open_coffeechat", s.pid);
    return ok({ table_no: mine.table_no, label: mine.label, talk_prompts: (meta.data?.talk_prompts as string[]) ?? [], members });
  });
}
