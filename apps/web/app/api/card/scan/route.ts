// POST /api/card/scan { qr_payload, source?, via? }  명함 QR 을 읽어 양방향으로 교환한다.
// 한 번 찍으면 두 행: 나→상대(qr 또는 manual), 상대→나(auto, seen_at null → 상대 화면에 알림).
// 이미 교환한 사이면 새로 넣지 않고 already_saved 로 같은 명함을 돌려준다.
// 개발 지시서 v0.2 H-05 · H-05-BE2:
// - QR(source qr)은 바로 성립(status confirmed). 이름 검색(source manual)은 확인 대기(pending)로 넣고 상대가 /api/card/confirm 으로 확인해야 성립한다.
//   확인 대기 중에 같은 사람을 QR 로 찍으면 바로 성립으로 바꾼다
// - via(card · event)는 스캐너를 연 탭. 판정과 무관하고 운영 콘솔 탭 불일치 수(A-07)에만 쓴다
// - 이용 동의를 거부한 사람은 교환할 수 없고, 거부한 사람의 명함도 교환되지 않는다(10/5 회의: 행사 중 수집 제외)
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { collectGuard, getConsent } from "@/lib/consent";
import { parseCardId } from "../_lib";
import { buildCards, getParticipantInEvent } from "../_server";

export const dynamic = "force-dynamic";

const REPEAT_WINDOW_SEC = 60;

const Body = z.object({
  qr_payload: z.string().trim().min(1),
  source: z.enum(["qr", "manual"]).default("qr"),
  via: z.enum(["card", "event"]).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());
    const guard = await collectGuard(s.pid);
    if (guard) return guard;

    const targetId = parseCardId(b.qr_payload);
    if (!targetId) {
      await logEvent("scan_fail", s.pid, { reason: "invalid_qr", via: b.via ?? null });
      return fail("NOT_FOUND", "명함 QR 형식이 아니다", 404);
    }
    if (targetId === s.pid) {
      await logEvent("scan_fail", s.pid, { reason: "self", via: b.via ?? null });
      return fail("SELF_SCAN", "내 명함이다", 400);
    }

    const target = await getParticipantInEvent(targetId);
    if (!target) {
      await logEvent("scan_fail", s.pid, { reason: "unknown", target_id: targetId, via: b.via ?? null });
      return fail("NOT_FOUND", "이 행사의 참가자가 아니다", 404);
    }
    if ((await getConsent(targetId)) === "refused") {
      await logEvent("scan_fail", s.pid, { reason: "target_refused", target_id: targetId, via: b.via ?? null });
      return fail("TARGET_UNAVAILABLE", "이 분은 앱 명함 교환을 쓰지 않는다", 409);
    }

    const { data: existing, error: exErr } = await db()
      .from("card_exchanges")
      .select("id, created_at, status, first_meet_at")
      .eq("scanner_id", s.pid)
      .eq("scanned_id", targetId)
      .maybeSingle();
    if (exErr) throw exErr;

    const now = new Date().toISOString();
    let alreadySaved = false;
    let status: "pending" | "confirmed" = b.source === "manual" ? "pending" : "confirmed";
    if (existing && !(existing.status === "pending" && b.source === "qr")) {
      alreadySaved = true;
      status = existing.status as "pending" | "confirmed";
      const ageSec = (Date.now() - new Date(existing.created_at as string).getTime()) / 1000;
      if (ageSec < REPEAT_WINDOW_SEC) await logEvent("scan_fail", s.pid, { reason: "repeat", target_id: targetId, via: b.via ?? null });
    } else if (existing) {
      // 이름 검색으로 확인 대기 중이던 사이를 QR 로 찍었다. 두 행을 바로 성립으로
      const { error } = await db()
        .from("card_exchanges")
        .update({ status: "confirmed", confirmed_at: now })
        .eq("status", "pending")
        .or(`and(scanner_id.eq.${s.pid},scanned_id.eq.${targetId}),and(scanner_id.eq.${targetId},scanned_id.eq.${s.pid})`);
      if (error) throw error;
      await logEvent("card_scan", s.pid, { target_id: targetId, source: b.source, via: b.via ?? null, upgraded: true });
    } else {
      // 상대가 먼저 나를 찍었으면 상대→나 행은 이미 있다. unique 충돌은 무시한다
      const confirmed_at = status === "confirmed" ? now : null;
      const { error: insErr } = await db()
        .from("card_exchanges")
        .upsert(
          [
            { scanner_id: s.pid, scanned_id: targetId, source: b.source, status, confirmed_at, via: b.via ?? null },
            { scanner_id: targetId, scanned_id: s.pid, source: "auto", status, confirmed_at },
          ],
          { onConflict: "scanner_id,scanned_id", ignoreDuplicates: true },
        );
      if (insErr) throw insErr;
      await logEvent("card_scan", s.pid, { target_id: targetId, source: b.source, via: b.via ?? null, status });
    }

    const cards = await buildCards([targetId], () => true);
    const card = cards.get(targetId);
    if (!card) return fail("NOT_FOUND", "명함을 만들 수 없다", 404);
    return ok({
      card: { ...card, source: b.source, status, exchanged_at: (existing?.created_at as string) ?? now },
      already_saved: alreadySaved,
      status,
      // 교환 결과 화면에서 오늘 처음 대화한 분인가요? 를 한 번만 묻는다(미션 ③). 성립했고 아직 답하거나 건너뛰지 않았을 때만
      ask_first_meet: status === "confirmed" && (existing?.first_meet_at ?? null) === null,
    });
  });
}
