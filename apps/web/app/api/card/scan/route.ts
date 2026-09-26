// POST /api/card/scan { qr_payload, source? }  명함 QR 을 읽어 양방향으로 교환한다.
// 한 번 찍으면 두 행: 나→상대(qr 또는 manual), 상대→나(auto, seen_at null → 상대 화면에 알림).
// 이미 교환한 사이면 새로 넣지 않고 already_saved 로 같은 명함을 돌려준다.
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { parseCardId } from "../_lib";
import { buildCards, getParticipantInEvent } from "../_server";

export const dynamic = "force-dynamic";

const REPEAT_WINDOW_SEC = 60;

const Body = z.object({
  qr_payload: z.string().trim().min(1),
  source: z.enum(["qr", "manual"]).default("qr"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());

    const targetId = parseCardId(b.qr_payload);
    if (!targetId) {
      await logEvent("scan_fail", s.pid, { reason: "invalid_qr" });
      return fail("NOT_FOUND", "명함 QR 형식이 아니다", 404);
    }
    if (targetId === s.pid) {
      await logEvent("scan_fail", s.pid, { reason: "self" });
      return fail("SELF_SCAN", "내 명함이다", 400);
    }

    const target = await getParticipantInEvent(targetId);
    if (!target) {
      await logEvent("scan_fail", s.pid, { reason: "unknown", target_id: targetId });
      return fail("NOT_FOUND", "이 행사의 참가자가 아니다", 404);
    }

    const { data: existing, error: exErr } = await db()
      .from("card_exchanges")
      .select("id, created_at")
      .eq("scanner_id", s.pid)
      .eq("scanned_id", targetId)
      .maybeSingle();
    if (exErr) throw exErr;

    let alreadySaved = false;
    if (existing) {
      alreadySaved = true;
      const ageSec = (Date.now() - new Date(existing.created_at as string).getTime()) / 1000;
      if (ageSec < REPEAT_WINDOW_SEC) await logEvent("scan_fail", s.pid, { reason: "repeat", target_id: targetId });
    } else {
      // 상대가 먼저 나를 찍었으면 상대→나 행은 이미 있다. unique 충돌은 무시한다
      const { error: insErr } = await db()
        .from("card_exchanges")
        .upsert(
          [
            { scanner_id: s.pid, scanned_id: targetId, source: b.source },
            { scanner_id: targetId, scanned_id: s.pid, source: "auto" },
          ],
          { onConflict: "scanner_id,scanned_id", ignoreDuplicates: true },
        );
      if (insErr) throw insErr;
      await logEvent("card_scan", s.pid, { target_id: targetId, source: b.source });
    }

    const cards = await buildCards([targetId], () => true);
    const card = cards.get(targetId);
    if (!card) return fail("NOT_FOUND", "명함을 만들 수 없다", 404);
    return ok({ card: { ...card, source: b.source, exchanged_at: (existing?.created_at as string) ?? new Date().toISOString() }, already_saved: alreadySaved });
  });
}
