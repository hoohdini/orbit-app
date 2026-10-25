// GET /api/poster/missions  이벤트 탭 미션 현황판(개발 지시서 v0.2 E-01 ~ E-06).
// 미션 4종 · 스탬프 5칸의 진행(n/목표), 완료 시각, 찍힌 스탬프 n/5, 진행도(= 스탬프 수 / 5, 10/22 민찬 결정). 판정은 서버가 한다(lib/missions.ts).
// window: not_started(서비스 소개 전, 곧 시작됩니다) · open · closed(마무리 뒤 읽기 전용, QR 버튼 숨김).
// feedback_open: 행사 후기(미션 ④)를 받는 단계인가(wrapup · award, 10/22 민찬 결정). 마감 뒤에도 후기 타일만 열린다.
//   조기 퇴장한 사람(checkins.left_at, 0019)은 그 전에도 true 다(10/25 민찬 결정). 0019 가 DB 에 없으면 나가지 않은 것으로 본다.
// 응모권은 앱에서 발급하지 않는다(결정 6, 명찰 번호로 앱 밖). 미션은 특별 시상 집계에만 쓴다.
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { opsSnapshot } from "@/lib/opsState";
import { missionWindow, feedbackOpen } from "@/lib/phase";
import { missionStatus, publicMission } from "@/lib/missions";
import { myCheckin } from "@/lib/checkinLeft";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const ops = await opsSnapshot();
    const m = await missionStatus(s.pid, ops.missionClosedAt);
    const fbOpen = feedbackOpen(ops.phase) || !!(await myCheckin(s.pid)).left_at; // 열린 단계면 체크인은 읽지 않는다
    return ok({ window: missionWindow(ops.phase), closed_at: ops.missionClosedAt, feedback_open: fbOpen, ...publicMission(m) });
  });
}
