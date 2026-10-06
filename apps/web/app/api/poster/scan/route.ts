// POST /api/poster/scan { qr_payload }  포스터 QR 스캔 → 포스터 정보, 관심 이유 선택지(사람마다 무작위 순서), 퀴즈(있으면). 정답 인덱스는 절대 넣지 않는다
// 개발 지시서 v0.2 E-02: 관심 이유 제출이 미션 ①이고 퀴즈는 선택이다. 퀴즈가 없는 포스터도 스캔된다(quiz: null)
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { parsePosterCode, shuffledReasons } from "../_lib";

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

    const { data: poster, error } = await db().from("posters").select("id, code, title, presenter").eq("code", code).maybeSingle();
    if (error) throw error;
    if (!poster) {
      await logEvent("scan_fail", s.pid, { reason: "unknown_code", code });
      return fail("NOT_FOUND", "등록되지 않은 포스터다", 404);
    }

    const [quizRes, mineRes] = await Promise.all([
      db().from("poster_quizzes").select("id, question, choices").eq("poster_id", poster.id).limit(1).maybeSingle(),
      db().from("poster_responses").select("reason").eq("participant_id", s.pid).eq("poster_id", poster.id).maybeSingle(),
    ]);
    if (quizRes.error) throw quizRes.error;
    if (mineRes.error) throw mineRes.error;

    await logEvent("poster_scan", s.pid, { poster_id: poster.id });
    return ok({
      poster: { id: poster.id, code: poster.code, title: poster.title, presenter: poster.presenter ?? null },
      reasons: shuffledReasons(),
      my_reason: (mineRes.data?.reason as string | undefined) ?? null,
      quiz: quizRes.data ? { id: quizRes.data.id, question: quizRes.data.question, choices: quizRes.data.choices } : null,
    });
  });
}
