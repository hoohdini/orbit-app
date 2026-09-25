// POST /api/poster/scan { qr_payload }  포스터 QR 스캔 → 퀴즈 반환. 정답 인덱스는 절대 넣지 않는다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { parsePosterCode } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({ qr_payload: z.string().trim().min(1) });

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());
    const code = parsePosterCode(b.qr_payload);
    if (!code) {
      await logEvent("scan_fail", s.pid, { reason: "invalid_qr" });
      return fail("NOT_FOUND", "QR 형식을 알아볼 수 없다", 404);
    }

    const { data: poster, error } = await db().from("posters").select("id, title").eq("code", code).maybeSingle();
    if (error) throw error;
    if (!poster) {
      await logEvent("scan_fail", s.pid, { reason: "unknown_code", code });
      return fail("NOT_FOUND", "등록되지 않은 포스터다", 404);
    }

    const { data: quiz, error: qErr } = await db()
      .from("poster_quizzes")
      .select("id, question, choices")
      .eq("poster_id", poster.id)
      .limit(1)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!quiz) {
      // 포스터는 있으나 퀴즈가 아직 적재되지 않은 운영 데이터 문제. 스캔 자체는 유효했으므로 scan_fail 로 남기지 않는다
      return fail("NOT_FOUND", "이 포스터에 등록된 퀴즈가 없다", 404);
    }

    await logEvent("poster_scan", s.pid, { poster_id: poster.id });
    return ok({ poster: { id: poster.id, title: poster.title }, quiz: { id: quiz.id, question: quiz.question, choices: quiz.choices } });
  });
}
