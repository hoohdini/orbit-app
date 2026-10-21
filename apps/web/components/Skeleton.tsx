// 로딩 스켈레톤(할 일 99). 데이터가 오기 전에 빈 화면 대신 자리 모양을 먼저 보여 준다.
// Skeleton 은 회색 막대 한 개, SkeletonRows 는 남색 테두리 목록(다른 탭 목록 모양) 자리를 그린다
export function Skeleton({ className = "" }: { className?: string }) {
  const round = /\brounded/.test(className) ? "" : "rounded-md"; // 둥글기를 넘기면 그것만 쓴다(클래스 충돌 방지)
  return <span aria-hidden className={`block animate-pulse bg-[#e9ecf2] ${round} ${className}`} />;
}

export function SkeletonRows({ rows = 3, label = "불러오는 중" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" className="w-full">
      <span className="sr-only">{label}</span>
      <div className="overflow-hidden rounded-3xl border border-[#d6dbe6] bg-white py-1">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={`flex items-center gap-3 px-5 py-4 ${i < rows - 1 ? "border-b border-[#eef0f4]" : ""}`}>
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <span className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div role="status" aria-busy="true" className="w-full space-y-3">
      <span className="sr-only">불러오는 중</span>
      <Skeleton className="h-[180px] w-full rounded-[14px]" />
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-[120px] w-full rounded-3xl" />
    </div>
  );
}
