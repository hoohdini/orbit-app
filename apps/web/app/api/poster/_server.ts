// 포스터 모듈 서버 전용 조회. 스캔 · 목록 · 요약(P-0 · P-1, 10/11 피그마 이벤트·미션)이 같은 모양의 참여 상태를 만든다.
import "server-only";
import { db } from "@/lib/db";
import { readOps } from "@/lib/opsState";
import { POSTER_MISSION_GOAL, QUIZ_MISSION_GOAL, reasonChoices } from "./_lib";

// 목록 머리 · 요약 · 퀴즈 결과의 관심 포스터 · 퀴즈 스탬프 수. 미션 마감(ops_state mission_closed_at) 뒤 기록은 세지 않는다.
// lib/missions.ts 와 같은 규칙이라 미션 현황판 숫자와 어긋나지 않는다(10/21 민찬). 마감 뒤 응답 저장은 막지 않는다(추천 계산에 쓴다)
export async function posterProgress(pid: string) {
  const [ops, resp, att] = await Promise.all([
    readOps(["mission_closed_at"]),
    db().from("poster_responses").select("created_at").eq("participant_id", pid),
    db().from("quiz_attempts").select("poster_id, created_at").eq("participant_id", pid).eq("is_correct", true),
  ]);
  for (const r of [resp, att]) if (r.error) throw r.error;
  const closedAt = typeof ops.mission_closed_at === "string" ? ops.mission_closed_at : null;
  const inTime = (t: unknown): boolean => typeof t === "string" && (!closedAt || t <= closedAt);
  return {
    responses: (resp.data ?? []).filter((r) => inTime(r.created_at)).length,
    poster_goal: POSTER_MISSION_GOAL,
    // 맞힌 서로 다른 포스터 수 = 포스터 퀴즈 스탬프 수(미션 ②)
    quiz_stamps: new Set((att.data ?? []).filter((r) => inTime(r.created_at)).map((r) => r.poster_id as number)).size,
    quiz_goal: QUIZ_MISSION_GOAL,
  };
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
  const [quizRes, mineRes, correctRes, progress] = await Promise.all([
    db().from("poster_quizzes").select("id, question, choices").eq("poster_id", poster.id).limit(1).maybeSingle(),
    db().from("poster_responses").select("reason").eq("participant_id", pid).eq("poster_id", poster.id).maybeSingle(),
    db().from("quiz_attempts").select("choice_index").eq("participant_id", pid).eq("poster_id", poster.id).eq("is_correct", true).limit(1).maybeSingle(),
    posterProgress(pid),
  ]);
  for (const r of [quizRes, mineRes, correctRes]) if (r.error) throw r.error;
  return {
    poster: { id: poster.id, code: poster.code, title: poster.title, presenter: poster.presenter ?? null, tags: poster.tags ?? [], booth: poster.booth ?? null, summary: poster.summary ?? null },
    reasons: reasonChoices(),
    my_reason: (mineRes.data?.reason as string | undefined) ?? null,
    quiz: quizRes.data ? { id: quizRes.data.id as number, question: quizRes.data.question as string, choices: quizRes.data.choices as string[] } : null,
    quiz_solved: !!correctRes.data,
    solved_choice: (correctRes.data?.choice_index as number | undefined) ?? null,
    progress,
  };
}

export const POSTER_COLS = "id, code, title, presenter, tags, booth, summary";
