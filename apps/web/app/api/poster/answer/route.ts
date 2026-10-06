// POST /api/poster/answer { quiz_id, choice_index }  서버 판정. 원격 풀이 방지 · 시도 상한을 여기서 처리한다
// 개발 지시서 v0.2 E-02: 퀴즈는 선택이고 미션과 무관하다. 정답이어도 스탬프 · 응모권을 주지 않는다
// (스탬프 = 관심 이유 제출, /api/poster/response. 응모권은 명찰 번호로 앱 밖, v0.2 결정 6).
// 풀어 본 기록은 그 포스터 관심 이유 응답의 quiz_attempted 에 남긴다(계산 서비스가 가중치 × 1.2)
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { parseMaxAttempts, SCAN_WINDOW_MIN } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({
  quiz_id: z.number().int().positive(),
  choice_index: z.number().int().min(0),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());

    const { data: quiz, error: qErr } = await db()
      .from("poster_quizzes")
      .select("id, poster_id, choices, answer_index")
      .eq("id", b.quiz_id)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!quiz) return fail("NOT_FOUND", "퀴즈를 찾을 수 없다", 404);

    const choices = quiz.choices as unknown[];
    if (b.choice_index >= choices.length) return fail("BAD_INPUT", "보기 범위를 벗어났다", 400);

    const posterId = quiz.poster_id as number;

    const scanSince = new Date(Date.now() - SCAN_WINDOW_MIN * 60_000).toISOString();
    const { data: recentScan, error: scanErr } = await db()
      .from("event_log")
      .select("id")
      .eq("kind", "poster_scan")
      .eq("participant_id", s.pid)
      .eq("payload->>poster_id", String(posterId))
      .gte("created_at", scanSince)
      .limit(1)
      .maybeSingle();
    if (scanErr) throw scanErr;
    if (!recentScan) return fail("SCAN_REQUIRED", `최근 ${SCAN_WINDOW_MIN}분 안에 이 포스터를 스캔해야 한다`, 403);

    const maxAttempts = parseMaxAttempts(process.env.POSTER_MAX_ATTEMPTS);
    const { count: attempts, error: cntErr } = await db()
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", s.pid)
      .eq("poster_id", posterId);
    if (cntErr) throw cntErr;
    if ((attempts ?? 0) >= maxAttempts) return fail("TOO_MANY_ATTEMPTS", "이 포스터의 시도 횟수를 넘었다", 429);

    const correct = b.choice_index === (quiz.answer_index as number);

    const { error: attemptErr } = await db()
      .from("quiz_attempts")
      .insert({ participant_id: s.pid, poster_id: posterId, choice_index: b.choice_index, is_correct: correct });
    if (attemptErr) throw attemptErr;

    // 관심 이유를 먼저 냈으면 그 응답에 '퀴즈 풀어 봄' 표시. 아직 안 냈으면 응답 API 가 제출할 때 퀴즈 시도 기록을 보고 채운다
    const { error: flagErr } = await db()
      .from("poster_responses")
      .update({ quiz_attempted: true })
      .eq("participant_id", s.pid)
      .eq("poster_id", posterId);
    if (flagErr) throw flagErr;

    const { count: stampTotal, error: newErr } = await db()
      .from("stamps")
      .select("poster_id", { count: "exact", head: true })
      .eq("participant_id", s.pid);
    if (newErr) throw newErr;

    await logEvent("poster_answer", s.pid, { poster_id: posterId, correct });
    return ok({ correct, stamp_count: stampTotal ?? 0, ticket_issued: false });
  });
}
