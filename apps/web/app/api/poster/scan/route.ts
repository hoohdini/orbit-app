// POST /api/poster/scan { qr_payload }  포스터 QR 스캔 → 포스터 정보, 응답 선택지(흥미 3단계, 고정 순서), 퀴즈(있으면), 내 참여 상태(10/11, _server.ts posterView).
// 정답 인덱스는 넣지 않는다(내가 이미 맞힌 경우의 내 답 solved_choice 만)
// 개발 지시서 v0.2 E-02: 응답 제출이 미션 ①, 퀴즈(이지선다) 정답이 미션 ②(10/11). 퀴즈가 없는 포스터도 스캔된다(quiz: null)
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { collectGuard } from "@/lib/consent";
import { parsePosterCode } from "../_lib";
import { posterView, POSTER_COLS } from "../_server";

export const dynamic = "force-dynamic";

// via 는 스캐너를 연 탭(card 명함 탭 · event 이벤트 탭). 운영 콘솔 탭 불일치 수(A-07)에만 쓴다
const Body = z.object({ qr_payload: z.string().trim().min(1), via: z.enum(["card", "event"]).optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const guard = await collectGuard(s.pid); // 동의 거부자는 행사 중 수집 제외(10/5 회의)
    if (guard) return guard;
    const b = Body.parse(await req.json());
    const code = parsePosterCode(b.qr_payload);
    if (!code) {
      await logEvent("scan_fail", s.pid, { reason: "invalid_qr" });
      return fail("NOT_FOUND", "QR 형식을 알아볼 수 없다", 404);
    }

    const { data: poster, error } = await db().from("posters").select(POSTER_COLS).eq("code", code).maybeSingle();
    if (error) throw error;
    if (!poster) {
      await logEvent("scan_fail", s.pid, { reason: "unknown_code", code });
      return fail("NOT_FOUND", "등록되지 않은 포스터다", 404);
    }

    await logEvent("poster_scan", s.pid, { poster_id: poster.id, via: b.via ?? null });
    return ok(await posterView(s.pid, poster));
  });
}
