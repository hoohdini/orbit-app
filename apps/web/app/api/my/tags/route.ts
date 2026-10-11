// GET /api/my/tags?q=<검색어>  관심 태그 고르기(마이페이지 태그 추가, 10/11 피그마). 이 행사 참가자 프로필의 주제 태그 모음에서 찾는다.
// 사람은 돌려주지 않고 태그 글자만 돌려준다(10/10 회의: 참석자 검색은 쓰지 않음. 태그 이름 목록은 사람을 찾는 기능이 아니다).
// q 가 없으면 많이 쓰인 순서로 20개. 목록에 없는 태그도 화면에서 직접 추가할 수 있다
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const LIMIT = 20;

export async function GET(req: Request) {
  return handle(async () => {
    await requireSession();
    const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/^#/, "").trim().toLowerCase();
    const { data, error } = await db().from("profiles").select("topic_tags, participants!inner(event_id)").eq("participants.event_id", eventId());
    if (error) throw error;
    const count = new Map<string, number>();
    for (const r of data ?? []) for (const t of (r.topic_tags as string[]) ?? []) count.set(t, (count.get(t) ?? 0) + 1);
    const tags = [...count.entries()]
      .filter(([t]) => !q || t.toLowerCase().includes(q))
      .sort((a, b) => (q ? Number(b[0].toLowerCase().startsWith(q)) - Number(a[0].toLowerCase().startsWith(q)) : 0) || b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
      .slice(0, LIMIT)
      .map(([t]) => t);
    return ok({ tags });
  });
}
