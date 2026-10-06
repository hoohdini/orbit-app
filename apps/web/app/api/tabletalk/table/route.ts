// GET /api/tabletalk/table  내 테이블토크 배정과 같은 테이블 구성원 소개
// 개발 지시서 v0.2 N-02: 구성원을 좌석 순서(seat_no, 원형 테이블 시계 방향)로 준다. 나를 맨 앞에 두고 내 다음 좌석부터 차례로 돈다.
// 이력 한 줄(career_line) = 지금 하는 일(Offer)의 첫 문장. 교수 · 운영진석(1번)도 같은 모양으로 나온다.
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
  seat_no: number | null;
  topic_tags: string[];
  career_line: string;
  offer_text: string;
};

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const mine = await getMyTable(s.pid, "tabletalk");
    if (!mine) return fail("NOT_PUBLISHED", "테이블토크 배정이 아직 공개되지 않았다", 404);

    const { data: rows, error } = await db()
      .from("current_tables")
      .select("participant_id, seat_no")
      .eq("round", "tabletalk")
      .eq("version", mine.version)
      .eq("table_no", mine.table_no);
    if (error) throw error;
    const seatOf = new Map((rows ?? []).map((r) => [r.participant_id as string, (r.seat_no as number | null) ?? null]));
    const ids = [...seatOf.keys()];

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
        seat_no: seatOf.get(p.id as string) ?? null,
        topic_tags: (prof?.topic_tags as string[]) ?? [],
        career_line: firstSentence(offer),
        offer_text: offer,
      };
    });

    // 좌석 순서. 좌석 번호가 없는 사람(현장 등록 등)은 뒤에 이름순. 그다음 나부터 시계 방향으로 돌린다
    members.sort((a, b) =>
      a.seat_no !== null && b.seat_no !== null ? a.seat_no - b.seat_no
      : a.seat_no !== null ? -1 : b.seat_no !== null ? 1 : a.display_name.localeCompare(b.display_name, "ko"));
    const me = members.findIndex((m) => m.id === s.pid);
    const ordered = me > 0 ? [...members.slice(me), ...members.slice(0, me)] : members;

    await logEvent("open_tabletalk", s.pid);
    return ok({ table_no: mine.table_no, label: mine.label, members: ordered });
  });
}
