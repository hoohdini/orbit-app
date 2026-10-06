// 키워드 검색 · 태그 목록이 같이 쓰는 조회(시제품). 이 행사에서 체크인했고 이용에 동의한 사람만. 본인은 부르는 쪽이 뺀다.
// 동의 거부 칸(consent_refused_at, v0.2 H-00)이 생기면 거부자도 여기서 뺀다. 지금은 동의 시각(consent_at)이 있는 사람만 쓴다
import "server-only";
import { db } from "@/lib/db";
import { eventId } from "@/lib/api";
import type { KeywordPerson } from "./_keyword";

export async function searchablePeople(): Promise<KeywordPerson[]> {
  const { data: people, error } = await db()
    .from("participants")
    .select("id, display_name, affiliation, cohort")
    .eq("event_id", eventId())
    .not("consent_at", "is", null);
  if (error) throw error;
  const ids = (people ?? []).map((p) => p.id as string);
  if (ids.length === 0) return [];

  const [ci, prof] = await Promise.all([
    db().from("checkins").select("participant_id").in("participant_id", ids),
    db().from("profiles").select("participant_id, topic_tags, offer_text, seek_text").in("participant_id", ids),
  ]);
  if (ci.error) throw ci.error;
  if (prof.error) throw prof.error;
  const checked = new Set((ci.data ?? []).map((c) => c.participant_id as string));
  const profileOf = new Map((prof.data ?? []).map((p) => [p.participant_id as string, p]));

  return (people ?? [])
    .filter((p) => checked.has(p.id as string))
    .map((p) => {
      const pr = profileOf.get(p.id as string);
      return {
        id: p.id as string,
        display_name: p.display_name as string,
        affiliation: (p.affiliation as string | null) ?? null,
        cohort: (p.cohort as number | null) ?? null,
        topic_tags: (pr?.topic_tags as string[]) ?? [],
        offer_text: (pr?.offer_text as string) ?? "",
        seek_text: (pr?.seek_text as string) ?? "",
      };
    });
}

// 부르는 사람도 동의 · 체크인한 사람이어야 검색할 수 있다(v0.2 H-00: 거부자는 검색 불가). 아니면 검색어도 남기지 않는다
export async function canSearch(pid: string): Promise<boolean> {
  const [me, ci] = await Promise.all([
    db().from("participants").select("consent_at").eq("id", pid).maybeSingle(),
    db().from("checkins").select("participant_id").eq("participant_id", pid).maybeSingle(),
  ]);
  if (me.error) throw me.error;
  if (ci.error) throw ci.error;
  return !!me.data?.consent_at && !!ci.data;
}
