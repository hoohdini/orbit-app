// 주소(SID) 3자리와 라벨. 홈과 명함이 같은 위치·글꼴로 쓴다.
export default function SidBadge({ sid, label, temp, tableNo }: { sid: number[] | null; label?: string | null; temp?: boolean; tableNo?: number | null }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-500">내 주소</span>
        {tableNo != null && <span className="text-xs text-gray-500">테이블 {tableNo}</span>}
      </div>
      <div className="mt-1 font-mono text-3xl tracking-widest">{sid ? sid.join("-") : "---"}</div>
      <div className="mt-1 text-sm text-gray-700">
        {label ?? "라벨 없음"}
        {temp && <span className="ml-2 rounded bg-yellow-100 px-1 text-xs text-yellow-800">임시</span>}
      </div>
    </div>
  );
}
