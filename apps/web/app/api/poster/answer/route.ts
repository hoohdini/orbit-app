// POST /api/poster/answer { quiz_id, choice_index }  서버 판정. 원격 풀이 방지 · 시도 상한을 여기서 처리한다
// 10/11 성하 결정(피그마 이벤트·미션): 퀴즈는 미션 ②(서로 다른 포스터 3개 맞히기). 정답이면 그 포스터 퀴즈 스탬프 1개(quiz_attempts 의 정답 기록으로 센다).
// 재시도는 무제한(POSTER_MAX_ATTEMPTS 를 설정했을 때만 제한). 이미 맞힌 포스터는 다시 내도 수가 늘지 않는다. 응모권은 주지 않는다(v0.2 결정 6).
// 원격 풀이 방지: 그 포스터를 한 번이라도 스캔한 기록이 있어야 한다(피그마 A31: 찍은 포스터는 목록에서 다시 열어 풀 수 있다).
// 퀴즈는 이지선다(10/5 회의).
// 풀어 본 기록은 그 포스터 응답의 quiz_attempted 에 남긴다(집계용. 계산 서비스는 10/6 부터 반영하지 않는다)
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { collectGuard } from "@/lib/consent";
import { parseMaxAttempts, QUIZ_MISSION_GOAL } from "../_lib";
import { quizStampCount } from "../_server";

export const dynamic = "force-dynamic";

const Body = z.object({
  quiz_id: z.number().int().positive(),
  choice_index: z.number().int().min(0),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const guard = await collectGuard(s.pid); // 동의 거부자는 행사 중 수집 제외(10/5 회의)
    if (guard) return guard;
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

    const { data: anyScan, error: scanErr } = await db()
      .from("event_log")
      .select("id")
      .eq("kind", "poster_scan")
      .eq("participant_id", s.pid)
      .eq("payload->>poster_id", String(posterId))
      .limit(1)
      .maybeSingle();
    if (scanErr) throw scanErr;
    if (!anyScan) return fail("SCAN_REQUIRED", "이 포스터의 QR 을 먼저 찍어야 한다", 403);

    if (process.env.POSTER_MAX_ATTEMPTS) {
      const maxAttempts = parseMaxAttempts(process.env.POSTER_MAX_ATTEMPTS);
      const { count: attempts, error: cntErr } = await db()
        .from("quiz_attempts")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", s.pid)
        .eq("poster_id", posterId);
      if (cntErr) throw cntErr;
      if ((attempts ?? 0) >= maxAttempts) return fail("TOO_MANY_ATTEMPTS", "이 포스터의 시도 횟수를 넘었다", 429);
    }

    const correct = b.choice_index === (quiz.answer_index as number);

    const { error: attemptErr } = await db()
      .from("quiz_attempts")
      .insert({ participant_id: s.pid, poster_id: posterId, choice_index: b.choice_index, is_correct: correct });
    if (attemptErr) throw attemptErr;

    // 포스터 응답(흥미 3단계)을 먼저 냈으면 그 응답에 '퀴즈 풀어 봄' 표시. 아직 안 냈으면 응답 API 가 제출할 때 퀴즈 시도 기록을 보고 채운다
    const { error: flagErr } = await db()
      .from("poster_responses")
      .update({ quiz_attempted: true })
      .eq("participant_id", s.pid)
      .eq("poster_id", posterId);
    if (flagErr) throw flagErr;

    const quizStamps = await quizStampCount(s.pid);

    await logEvent("poster_answer", s.pid, { poster_id: posterId, correct });
    // stamp_count 는 예전 화면용(= quiz_stamps)
    return ok({ correct, quiz_stamps: quizStamps, quiz_goal: QUIZ_MISSION_GOAL, stamp_count: quizStamps, ticket_issued: false });
  });
}
