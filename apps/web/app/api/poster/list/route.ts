// GET /api/poster/list  포스터 세션 목록(P-0, 10/11 피그마 이벤트·미션). 전체 포스터와 내 참여 상태.
// scanned 가 false 인 포스터는 화면에서 열리지 않는다(피그마 A31: QR 을 한 번이라도 찍은 포스터만 요약으로). 정답은 넣지 않는다
import { db } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { posterProgress, scannedPosterIds } from "../_server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const [posters, quizzes, mine, correct, scanned, progress] = await Promise.all([
      db().from("posters").select("id, code, title, presenter, tags, booth").order("code"),
      db().from("poster_quizzes").select("poster_id"),
      db().from("poster_responses").select("poster_id, reason").eq("participant_id", s.pid),
      db().from("quiz_attempts").select("poster_id").eq("participant_id", s.pid).eq("is_correct", true),
      scannedPosterIds(s.pid),
      posterProgress(s.pid), // 마감 뒤 기록은 세지 않는다(lib/missions.ts 와 같은 규칙, 10/21 민찬)
    ]);
    for (const r of [posters, quizzes, mine, correct]) if (r.error) throw r.error;
    const hasQuiz = new Set((quizzes.data ?? []).map((q) => q.poster_id as number));
    const reasonOf = new Map((mine.data ?? []).map((r) => [r.poster_id as number, r.reason as string]));
    const solved = new Set((correct.data ?? []).map((r) => r.poster_id as number));
    const list = (posters.data ?? []).map((p) => ({
      id: p.id as number,
      code: p.code as string,
      title: p.title as string,
      presenter: (p.presenter as string | null) ?? null,
      tags: (p.tags as string[] | null) ?? [],
      booth: (p.booth as string | null) ?? null,
      scanned: scanned.has(p.id as number),
      my_reason: reasonOf.get(p.id as number) ?? null,
      has_quiz: hasQuiz.has(p.id as number),
      quiz_solved: solved.has(p.id as number),
    }));
    return ok({
      posters: list,
      total: list.length,
      scanned_count: list.filter((p) => p.scanned).length,
      progress,
    });
  });
}
