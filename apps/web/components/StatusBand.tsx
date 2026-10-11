"use client";
// 전역 상태 띠(개발 지시서 v0.2 H-01). 모든 탭 맨 위 한 줄. 운영 공지가 있으면 공지를 먼저, 없으면 지금 단계와 내 위치.
// 이벤트 탭에서는 미션 진행(n/4)을 붙인다. 값은 /api/state(useOrbitState) 하나에서 온다.
// 모양은 피그마 StatusStrip(10/11): 높이 36, 연한 남색 바탕, 왼쪽 라이브 점. 모든 탭에서 맨 위(헤더 바로 아래)에 둔다(10/11 일관성 정리)
import { useOrbitState, type OrbitState } from "./useOrbitState";

function where(s: OrbitState): string {
  if (s.phase?.startsWith("coffeechat") && s.coffeechat) return `${s.coffeechat.group_no}번 그룹`;
  if (s.tabletalk) return `${s.tabletalk.table_no}번 테이블${s.tabletalk.seat_no ? ` ${s.tabletalk.seat_no}번 자리` : ""}`;
  return "";
}

export default function StatusBand({ showMission = false }: { showMission?: boolean }) {
  const s = useOrbitState();
  const place = "sticky top-0 z-20";
  if (!s) return <div className="h-9 shrink-0 bg-strip" />;

  if (s.notice) {
    return (
      <div role="status" className={`${place} flex min-h-9 items-center gap-2 bg-yellow-50 px-5 py-2 text-[13px] font-medium text-yellow-900`}>
        {s.notice.text}
      </div>
    );
  }

  const parts = [s.phase_label ? `${s.phase_label} 진행 중` : "The ORBIT", where(s)].filter(Boolean);
  return (
    <div className={`${place} flex h-9 items-center gap-2 border-b border-navy/80 bg-strip px-5 text-[13px] font-medium text-brand`}>
      <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden />
      <span className="flex-1 truncate">{parts.join(" · ")}</span>
      {showMission && s.mission.window !== "not_started" && (
        <span className="font-semibold">
          미션 {s.mission.done_count}/{s.mission.total}
        </span>
      )}
    </div>
  );
}
