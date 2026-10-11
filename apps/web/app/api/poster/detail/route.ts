// GET /api/poster/detail?id=<poster_id>  포스터 요약과 내 참여 상태(P-1). 목록에서 다시 열 때 쓴다(피그마 A31, QR 검증 없음).
// 한 번도 스캔하지 않은 포스터는 403 SCAN_REQUIRED. 응답 모양은 /api/poster/scan 과 같다. 스캔 기록은 남기지 않는다
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { posterView, scannedPosterIds, POSTER_COLS } from "../_server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return fail("BAD_INPUT", "id 가 필요하다", 400);
    if (!(await scannedPosterIds(s.pid)).has(id)) return fail("SCAN_REQUIRED", "이 포스터의 QR 을 먼저 찍어야 한다", 403);
    const { data: poster, error } = await db().from("posters").select(POSTER_COLS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!poster) return fail("NOT_FOUND", "포스터를 찾을 수 없다", 404);
    return ok(await posterView(s.pid, poster));
  });
}
