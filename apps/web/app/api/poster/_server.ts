// 포스터 모듈 서버 전용 조회. 스캔 · 목록 · 요약(P-0 · P-1, 10/11 피그마 이벤트·미션)이 같은 모양의 참여 상태를 만든다.
import "server-only";
import { db } from "@/lib/db";
import { POSTER_MISSION_GOAL, QUIZ_MISSION_GOAL, reasonChoices } from "./_lib";

// 맞힌 서로 다른 포스터 수 = 포스터 퀴즈 스탬프 수(미션 ②)
export async function quizStampCount(pid: string): Promise<number> {
  const { data, error } = await db().from("quiz_attempts").select("poster_id").eq("participant_id", pid).eq("is_correct", true);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.poster_id as number)).size;
}

// 한 번이라도 스캔한 포스터 id
export async function scannedPosterIds(pid: string): Promise<Set<number>> {
  const { data, error } = await db().from("event_log").select("payload").eq("kind", "poster_scan").eq("participant_id", pid);
  if (error) throw error;
  return new Set((data ?? []).map((r) => Number((r.payload as { poster_id?: number } | null)?.poster_id)).filter((n) => Number.isFinite(n)));
}

type PosterRow = { id: number; code: string; title: string; presenter: string | null; tags: string[] | null; booth: string | null; summary: string | null };

// 포스터 한 장의 요약과 내 참여 상태(P-1). 정답 인덱스는 내가 맞힌 경우에만(그 답이 정답이므로) 돌려준다
export async function posterView(pid: string, poster: PosterRow) {
  const [quizRes, mineRes, correctRes, respCount, quizStamps] = await Promise.all([
    db().from("poster_quizzes").select("id, question, choices").eq("poster_id", poster.id).limit(1).maybeSingle(),
    db().from("poster_responses").select("reason").eq("participant_id", pid).eq("poster_id", poster.id).maybeSingle(),
    db().from("quiz_attempts").select("choice_index").eq("participant_id", pid).eq("poster_id", poster.id).eq("is_correct", true).limit(1).maybeSingle(),
    db().from("poster_responses").select("poster_id", { count: "exact", head: true }).eq("participant_id", pid),
    quizStampCount(pid),
  ]);
  for (const r of [quizRes, mineRes, correctRes, respCount]) if (r.error) throw r.error;
  return {
    poster: { id: poster.id, code: poster.code, title: poster.title, presenter: poster.presenter ?? null, tags: poster.tags ?? [], booth: poster.booth ?? null, summary: poster.summary ?? null },
    reasons: reasonChoices(),
    my_reason: (mineRes.data?.reason as string | undefined) ?? null,
    quiz: quizRes.data ? { id: quizRes.data.id as number, question: quizRes.data.question as string, choices: quizRes.data.choices as string[] } : null,
    quiz_solved: !!correctRes.data,
    solved_choice: (correctRes.data?.choice_index as number | undefined) ?? null,
    progress: { responses: respCount.count ?? 0, poster_goal: POSTER_MISSION_GOAL, quiz_stamps: quizStamps, quiz_goal: QUIZ_MISSION_GOAL },
  };
}

export const POSTER_COLS = "id, code, title, presenter, tags, booth, summary";
