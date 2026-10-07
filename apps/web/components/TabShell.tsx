// 참가자 4탭 공통 틀(개발 지시서 v0.2). 맨 위 상태 띠(H-01), 본문, 만족도 전면 카드(N-03), 하단 메뉴.
// 글자색을 직접 정한다. globals.css 가 폰 다크 모드에서 글자를 밝게 바꿔 흰 카드 위에서 안 보이기 때문이다
import BottomNav from "./BottomNav";
import StatusBand from "./StatusBand";
import SatisfactionGate from "./SatisfactionGate";

export default function TabShell({ children, showMission = false, extra }: { children: React.ReactNode; showMission?: boolean; extra?: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-md pb-20 text-gray-900">
      <StatusBand showMission={showMission} />
      {children}
      {extra}
      <SatisfactionGate />
      <BottomNav />
    </div>
  );
}
