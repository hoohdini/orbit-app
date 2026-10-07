"use client";
// 전역 상태 띠(개발 지시서 v0.2 H-01). 모든 탭 맨 위 한 줄. 운영 공지가 있으면 공지를 먼저, 없으면 지금 단계와 내 위치.
// 이벤트 탭에서는 미션 진행(n/4)을 붙인다. 값은 /api/state(useOrbitState) 하나에서 온다.
import { useOrbitState, type OrbitState } from "./useOrbitState";

function where(s: OrbitState): string {
  if (s.phase?.startsWith("coffeechat") && s.coffeechat) return `${s.coffeechat.group_no}번 그룹`;
  if (s.tabletalk) return `${s.tabletalk.table_no}번 테이블${s.tabletalk.seat_no ? ` ${s.tabletalk.seat_no}번 자리` : ""}`;
  return "";
}

export default function StatusBand({ showMission = false }: { showMission?: boolean }) {
  const s = useOrbitState();
  if (!s) return <div className="h-9 border-b border-gray-100 bg-gray-50" />;

  if (s.notice) {
    return (
      <div role="status" className="sticky top-0 z-20 border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-900">
        {s.notice.text}
      </div>
    );
  }

  const parts = [s.phase_label || "ORBIT", where(s)].filter(Boolean);
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-700">
      <span>{parts.join(" · ")}</span>
      {showMission && s.mission.window !== "not_started" && (
        <span className="font-semibold">
          미션 {s.mission.done_count}/{s.mission.total}
        </span>
      )}
    </div>
  );
}
