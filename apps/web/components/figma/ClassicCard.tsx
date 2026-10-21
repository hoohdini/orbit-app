// 피그마 마이페이지 페이지의 명함 디자인 시안 A(클래식). 흰 카드, 왼쪽 위 DSL 로고, 큰 이름, 분야 · 소속, 관심사, 아래 남색 줄.
// 내 명함(마이 첫 화면 · 명함 편집 미리보기)에 쓴다. 피그마 좌표(353x202)로 그리고 zoom 으로 폭에 맞춘다(10/21)
import type { Card } from "@/app/api/card/_lib";

export const CLASSIC_CARD_W = 353;

export default function ClassicCard({ card, zoom = 1 }: { card: Card; zoom?: number }) {
  const field = card.label || card.offer_text.split(/[.\n]/)[0]?.trim() || "";
  const sub = [field, card.affiliation].filter(Boolean).join("  ·  ");
  const interests = card.topic_tags.slice(0, 3).join(" · ");
  return (
    <div
      className="relative mx-auto h-[202px] w-[353px] overflow-hidden rounded-[14px] border border-[#e3e6ea] bg-white shadow-[0_6px_18px_rgba(20,35,74,0.10)]"
      style={zoom !== 1 ? { zoom } : undefined}
    >
      <div className="flex items-start justify-between px-[22px] pt-[22px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="DSL" src="/figma/dsl-logo-card.svg" className="h-[30px] w-[53px]" />
        <span className="pt-1.5 text-[9px] font-medium tracking-[0.14em] text-ink-3">THE ORBIT 2026</span>
      </div>
      <div className="px-[22px] pt-[26px]">
        <p className="flex items-baseline gap-2.5">
          <span className="max-w-[230px] truncate text-[26px] font-bold leading-[1.2] text-ink">{card.display_name}</span>
          {card.cohort ? <span className="text-[10px] font-medium tracking-[0.16em] text-ink-3">{card.cohort}기</span> : null}
        </p>
        {sub && <p className="mt-1 truncate text-[13px] font-medium text-accent">{sub}</p>}
      </div>
      {interests && (
        <div className="absolute inset-x-[22px] bottom-[21px] flex items-center gap-4 border-t border-[#e3e6ea] pt-[11px]">
          <span className="shrink-0 text-[8px] font-bold tracking-[0.14em] text-ink-3">INTERESTS</span>
          <span className="truncate text-[11px] text-ink">{interests}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-[5px] bg-brand" />
    </div>
  );
}
