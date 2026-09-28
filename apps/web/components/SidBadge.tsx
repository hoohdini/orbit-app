// 내 분야 이름표(라벨). 홈과 온보딩 테이블 안내가 같은 위치·글꼴로 쓴다.
// 주소(SID) 숫자는 참가자에게 보여 주지 않는다(9/27 회의). 숫자는 궤도 계산에만 쓰고, 화면에는 첫자리 묶음 이름표만 보여 준다.
// sid 는 발급 여부(null 이면 발급 전)를 판단하는 데만 쓴다.
export default function SidBadge({ sid, label, temp, tableNo }: { sid: number[] | null; label?: string | null; temp?: boolean; tableNo?: number | null }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-500">내 분야</span>
        {tableNo != null && <span className="text-xs text-gray-500">테이블 {tableNo}</span>}
      </div>
      <div className="mt-1 text-xl font-semibold">
        {sid ? (label ?? "이름표 준비 중") : "발급 전"}
        {temp && <span className="ml-2 rounded bg-yellow-100 px-1 align-middle text-xs font-normal text-yellow-800">임시</span>}
      </div>
    </div>
  );
}
