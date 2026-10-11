// POST /api/onboarding/consent { agreed: true | false, item?: collect | share }
// 개발 지시서 v0.2 H-00: 거부도 저장한다(consent_refused_at). 10/5 회의 결정: 거부자도 사전 등록 정보로 배정에는 들어가고,
// 행사 중 수집(명함 교환, 만족도, 포스터 응답, 검색어)만 막는다(lib/consent.ts). 마이페이지(M-03)에서 다시 동의하면 거부 기록을 지운다.
// 10/11(0014): 동의가 두 항목이다. item 을 빼면 두 항목을 같이 정한다(온보딩의 동의합니다 · 동의하지 않습니다).
//   collect = 개인정보 수집 및 이용, share = 명함 공개 및 추천 활용. 마이페이지 내 정보는 항목별로 보낸다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { consentOf, shareOf } from "@/lib/consent";

export const dynamic = "force-dynamic";

const Body = z.object({ agreed: z.boolean(), item: z.enum(["collect", "share"]).optional() });

const COLS = {
  collect: { at: "consent_at", refused: "consent_refused_at" },
  share: { at: "share_consent_at", refused: "share_refused_at" },
} as const;

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const { agreed, item } = Body.parse(await req.json());
    const now = new Date().toISOString();
    for (const key of item ? [item] : (["collect", "share"] as const)) {
      const c = COLS[key];
      if (agreed) {
        // 이미 동의한 사람은 처음 동의 시각을 그대로 둔다
        const { error } = await db().from("participants").update({ [c.at]: now, [c.refused]: null }).eq("id", s.pid).is(c.at, null);
        if (error) throw error;
      } else {
        const { error } = await db().from("participants").update({ [c.at]: null, [c.refused]: now }).eq("id", s.pid);
        if (error) throw error;
      }
    }
    const { data } = await db().from("participants").select("consent_at, consent_refused_at, share_consent_at, share_refused_at").eq("id", s.pid).maybeSingle();
    if (!data) return fail("NOT_FOUND", "참가자를 찾을 수 없다", 404);
    await logEvent(agreed ? "consent" : "consent_refused", s.pid, { item: item ?? "both" });
    return ok({
      consent: consentOf(data),
      consent_at: data.consent_at,
      consent_refused_at: data.consent_refused_at,
      share: shareOf(data),
      share_consent_at: data.share_consent_at,
      share_refused_at: data.share_refused_at,
    });
  });
}
