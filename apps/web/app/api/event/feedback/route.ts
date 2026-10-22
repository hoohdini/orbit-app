// GET /api/event/feedback   내가 남긴 행사 후기. 없으면 feedback: null(동의 거부자의 익명 후기는 사람과 잇지 않아 찾을 수 없다)
// POST /api/event/feedback { rating, tags, comment? }  행사 후기 제출(피그마 이벤트·미션, 미션 ④).
// rating = 1 별로였다 · 2 좋았다 · 3 최고였다. tags 는 고른 항목(여러 개, 없어도 됨), comment 는 100자까지.
// 커피챗이 끝난 뒤(wrapup · award)에만 받는다. 그 전은 409 FEEDBACK_NOT_OPEN(10/22 민찬 결정). 미션 마감(wrapup)과 같은 때 열리므로 마감으로 스탬프를 자르지 않는다(lib/missions.ts).
// 동의한 사람: 한 사람당 한 건(event_feedback). 다시 내면 덮어쓰고 처음 낸 시각(created_at)은 그대로 둔다. 스탬프 1칸.
// 동의 거부자: 사람과 잇지 않고 event_feedback_anon(0019)에 저장한다. 스탬프 없음, event_log 에도 남기지 않는다(10/22 민찬 결정).
// 동의를 아직 고르지 않은 사람: 403 CONSENT_REQUIRED(먼저 고르게 한다).
// 응답 { saved: true, anonymous, stamp } 의 anonymous · stamp 로 완료 화면이 스탬프 문구를 고른다.
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { getConsent } from "@/lib/consent";
import { opsSnapshot } from "@/lib/opsState";
import { feedbackOpen } from "@/lib/phase";

export const dynamic = "force-dynamic";

// 화면 목록은 (modules)/event/feedback/choices.ts. 모듈은 import 하지 않으므로 키만 여기에 둔다
const TAG_KEYS = ["card_exchange", "recommended", "mission_stamp", "qr_scan", "layout", "speed", "notification"] as const;

const Body = z.object({
  rating: z.number().int().min(1).max(3),
  tags: z.array(z.enum(TAG_KEYS)).max(TAG_KEYS.length).default([]),
  comment: z.string().trim().max(100).optional(),
});

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const { data, error } = await db().from("event_feedback").select("rating, tags, comment").eq("participant_id", s.pid).maybeSingle();
    if (error) throw error;
    return ok({ feedback: data ? { rating: data.rating as number, tags: (data.tags as string[]) ?? [], comment: (data.comment as string | null) ?? "" } : null });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());
    const ops = await opsSnapshot();
    if (!feedbackOpen(ops.phase)) return fail("FEEDBACK_NOT_OPEN", "커피챗이 끝난 뒤 남길 수 있다", 409);

    const consent = await getConsent(s.pid);
    if (consent === "pending") return fail("CONSENT_REQUIRED", "이용 동의가 필요하다", 403);
    const row = { rating: b.rating, tags: Array.from(new Set(b.tags)), comment: b.comment || null };

    if (consent === "refused") {
      // 수집을 거부했으므로 누가 냈는지 남기지 않는다(participant_id 없음, event_log 없음)
      const { error } = await db().from("event_feedback_anon").insert({ source: "consent_refused", ...row });
      if (error) throw error;
      return ok({ saved: true, anonymous: true, stamp: false });
    }

    // 한 번에 넣거나 덮어쓴다(먼저 읽고 넣으면 두 번 눌렀을 때 PK 충돌이 났다). created_at 은 보내지 않아 처음 낸 시각이 남는다
    const { error } = await db()
      .from("event_feedback")
      .upsert({ participant_id: s.pid, ...row, updated_at: new Date().toISOString() }, { onConflict: "participant_id" });
    if (error) throw error;

    await logEvent("event_feedback", s.pid, { rating: b.rating, tags: row.tags.length });
    return ok({ saved: true, anonymous: false, stamp: true });
  });
}
