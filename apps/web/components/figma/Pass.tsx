// 피그마 Pass 컴포넌트(내 명함 = 여권 신원정보면, 남색 면은 이 카드에만). 내 명함(마이 첫 화면 · 명함 편집 미리보기)에 같이 쓴다.
// 남의 명함(명함 상세)은 라벨형(시안 C)을 쓴다. 10/11 명함 모양 정리
import type { Card } from "@/app/api/card/_lib";

// 피그마 Pass(내 명함 = 여권 신원정보면). 남색 카드, 한글/영문 병기 라벨
export default function Pass({ card, zoom = 1 }: { card: Card; zoom?: number }) {
  const field = card.label || card.offer_text.split(/[.\n]/)[0] || "-";
  return (
    <div className={`mx-auto rounded-[18px] bg-brand p-[15px] shadow-[0_6px_9px_rgba(12,23,51,0.1)] w-[251px]`} style={zoom !== 1 ? { zoom } : undefined}>
      <div className="flex justify-between font-mono text-[6px] uppercase tracking-[0.45px] text-muted">
        <span>ORBIT PASS</span>
        <span>P / ORB / 2026</span>
      </div>
      <div className="mt-3 flex gap-3">
        <span className="flex h-[72px] w-[57px] shrink-0 items-center justify-center rounded-[9px] bg-[#1b2f5e] font-mono text-[9px] text-muted">{card.display_name.slice(0, 2)}</span>
        <div className="min-w-0 space-y-2">
          <div>
            <p className="text-[7px] text-muted">성명 / NAME</p>
            <p className="text-[10px] font-medium text-white">{card.display_name}</p>
          </div>
          <div className="flex gap-4">
            <div className="min-w-0">
              <p className="text-[7px] text-muted">분야 / FIELD</p>
              <p className="truncate text-[8px] font-medium text-white">{field}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[7px] text-muted">소속 / ORG</p>
              <p className="truncate text-[8px] font-medium text-white">{card.affiliation ?? "-"}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 h-px bg-[#3a4f86]" />
    </div>
  );
}
