// POST /api/onboarding/consent { agreed: true | false }
// 개발 지시서 v0.2 H-00: 거부도 저장한다(consent_refused_at). 10/5 회의 결정: 거부자도 사전 등록 정보로 배정에는 들어가고,
// 행사 중 수집(명함 교환, 만족도, 포스터 응답, 검색어)만 막는다(lib/consent.ts). 마이페이지(M-03)에서 다시 동의하면 거부 기록을 지운다.
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { consentOf } from "@/lib/consent";

export const dynamic = "force-dynamic";

const Body = z.object({ agreed: z.boolean() });

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const { agreed } = Body.parse(await req.json());
    const now = new Date().toISOString();
    if (agreed) {
      // 이미 동의한 사람은 처음 동의 시각을 그대로 둔다
      const { error } = await db().from("participants").update({ consent_at: now, consent_refused_at: null }).eq("id", s.pid).is("consent_at", null);
      if (error) throw error;
    } else {
      const { error } = await db().from("participants").update({ consent_at: null, consent_refused_at: now }).eq("id", s.pid);
      if (error) throw error;
    }
    const { data } = await db().from("participants").select("consent_at, consent_refused_at").eq("id", s.pid).maybeSingle();
    if (!data) return fail("NOT_FOUND", "참가자를 찾을 수 없다", 404);
    await logEvent(agreed ? "consent" : "consent_refused", s.pid);
    return ok({ consent: consentOf(data), consent_at: data.consent_at, consent_refused_at: data.consent_refused_at });
  });
}
