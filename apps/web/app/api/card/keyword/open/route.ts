// POST /api/card/keyword/open { q, target_id }  검색 결과에서 사람을 열어 봤다(시제품). event_log(keyword_open)에만 남긴다.
// 계산 서비스가 커피챗 때 '검색 → 열어 봄'(폭 0.2), '검색 → 열어 봄 → 명함 교환'(폭 0.3)으로 추천에 반영한다(pipeline/search.py)
import { z } from "zod";
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

const Body = z.object({ q: z.string().trim().min(1).max(30), target_id: z.string().uuid() });

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());
    await logEvent("keyword_open", s.pid, { q: b.q, target_id: b.target_id });
    return ok({ saved: true });
  });
}
