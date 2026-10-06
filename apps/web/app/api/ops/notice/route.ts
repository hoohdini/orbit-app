// POST /api/ops/notice { preset? | text?, minutes? }  공지 송출(개발 지시서 v0.2 A-06). 만료 시각까지 참가자 상태 띠(H-01)에 뜬다.
// 버튼 3종(preset: start · move · last5, 문구는 lib/phase.ts)과 자유 입력(text) 중 하나. 둘 다 없으면(clear: true) 공지를 내린다.
import { z } from "zod";
import { ok, fail, handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { NOTICE_PRESETS, NOTICE_PRESET_KEYS } from "@/lib/phase";
import { db } from "@/lib/db";
import { opsSet } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({
  preset: z.enum(NOTICE_PRESET_KEYS).optional(),
  text: z.string().trim().min(1).max(80).optional(),
  minutes: z.number().int().min(1).max(60).default(5),
  clear: z.boolean().default(false),
});

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = Body.parse(await req.json());

    if (b.clear) {
      const { error } = await db().from("ops_state").delete().eq("key", "notice");
      if (error) throw error;
      await logEvent("ops_notice", admin.pid, { cleared: true });
      return ok({ notice: null });
    }

    const text = b.text ?? NOTICE_PRESETS.find((p) => p.key === b.preset)?.text;
    if (!text) return fail("BAD_INPUT", "preset 이나 text 중 하나가 필요하다", 400);
    const at = new Date();
    const notice = { text, preset: b.text ? null : (b.preset ?? null), expires_at: new Date(at.getTime() + b.minutes * 60_000).toISOString(), at: at.toISOString(), by: admin.pid };
    await opsSet("notice", notice);
    await logEvent("ops_notice", admin.pid, { text, preset: notice.preset, minutes: b.minutes });
    return ok({ notice: { text, preset: notice.preset, expires_at: notice.expires_at } });
  });
}
