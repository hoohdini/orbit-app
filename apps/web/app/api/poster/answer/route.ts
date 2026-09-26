// POST /api/poster/answer { quiz_id, choice_index }  서버 판정. 원격 풀이 방지·시도 상한·스탬프·응모권을 여기서 처리한다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { parseMaxAttempts, parseThresholds, reachedThresholds, raffleReason } from "../_lib";

export const dynamic = "force-dynamic";

// 원격 풀이 방지: 이 시간 안에 이 포스터를 스캔한 기록이 있어야 답을 낼 수 있다
const SCAN_WINDOW_MIN = 15;

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

    // 이미 스탬프를 받았으면 재적립 없이 정답 판정만 돌려준다. 시도 상한도 이 경우는 넘지 않는다
    const { data: existingStamp, error: stampErr } = await db()
      .from("stamps")
      .select("poster_id")
      .eq("participant_id", s.pid)
      .eq("poster_id", posterId)
      .maybeSingle();
    if (stampErr) throw stampErr;
    const hadStamp = !!existingStamp;

    if (!hadStamp) {
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

    if (correct && !hadStamp) {
      const { error: insErr } = await db()
        .from("stamps")
        .upsert({ participant_id: s.pid, poster_id: posterId }, { onConflict: "participant_id,poster_id", ignoreDuplicates: true });
      if (insErr) throw insErr;
    }

    const { count: newTotal, error: newErr } = await db()
      .from("stamps")
      .select("poster_id", { count: "exact", head: true })
      .eq("participant_id", s.pid);
    if (newErr) throw newErr;

    // 도달한 임계값 전부를 매번 넣는다. unique(participant_id, reason) 라 중복은 무시되고,
    // 중간에 실패해 빠진 응모권이 있어도 다음 정답 때 채워진다
    const thresholds = parseThresholds(process.env.POSTER_RAFFLE_THRESHOLDS);
    const crossed = reachedThresholds(newTotal ?? 0, thresholds);

    let ticketIssued = false;
    if (crossed.length > 0) {
      const rows = crossed.map((t) => ({ participant_id: s.pid, reason: raffleReason(t) }));
      const { data: inserted, error: ticketErr } = await db()
        .from("raffle_tickets")
        .upsert(rows, { onConflict: "participant_id,reason", ignoreDuplicates: true })
        .select("reason");
      if (ticketErr) throw ticketErr;
      ticketIssued = (inserted ?? []).length > 0;
    }

    await logEvent("poster_answer", s.pid, { poster_id: posterId, correct });
    return ok({ correct, stamp_count: newTotal ?? 0, ticket_issued: ticketIssued });
  });
}
