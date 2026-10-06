// GET /api/poster/missions  이벤트 탭 미션 현황판(개발 지시서 v0.2 E-01 ~ E-06).
// 미션 4종의 진행(n/목표), 완료 시각, 전체 n/4, 진행도(네 미션 달성률 평균). 판정은 서버가 한다(lib/missions.ts).
// window: not_started(서비스 소개 전, 곧 시작됩니다) · open · closed(마무리 뒤 읽기 전용, QR 버튼 숨김).
// 응모권은 앱에서 발급하지 않는다(결정 6, 명찰 번호로 앱 밖). 미션은 특별 시상 집계에만 쓴다.
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { opsSnapshot } from "@/lib/opsState";
import { missionWindow } from "@/lib/phase";
import { missionStatus, publicMission } from "@/lib/missions";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const ops = await opsSnapshot();
    const m = await missionStatus(s.pid, ops.missionClosedAt);
    return ok({ window: missionWindow(ops.phase), closed_at: ops.missionClosedAt, ...publicMission(m) });
  });
}
