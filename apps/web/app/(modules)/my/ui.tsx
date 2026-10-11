// 마이페이지 화면이 같이 쓰는 피그마 조각(ListRow 묶음 · 섹션 제목 · 안내 상자 · 큰 버튼)
import Link from "next/link";
import { IconChevron } from "@/components/figma/Icons";

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-navy">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function RowGroup({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-3xl border border-navy bg-white py-1 [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-navy">{children}</div>;
}

export function Row({ href, title, sub, trail, lead }: { href: string; title: string; sub?: string; trail?: string; lead?: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 px-5 py-3">
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium leading-6 tracking-[-0.16px] text-ink">{title}</span>
        {sub && <span className="block truncate text-sm leading-5 tracking-[-0.14px] text-ink-2">{sub}</span>}
      </span>
      {trail && <span className="shrink-0 text-sm font-medium text-brand">{trail}</span>}
      <IconChevron dir="right" className="shrink-0 text-ink-3" />
    </Link>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-navy bg-strip px-5 py-3.5 text-[13px] font-medium leading-normal text-accent">{children}</p>;
}

export const bigBtn = "flex h-14 w-full items-center justify-center rounded-2xl bg-brand text-base font-medium text-white disabled:bg-field disabled:text-ink-3";
export const ghostBtn = "flex h-14 w-full items-center justify-center rounded-2xl border border-navy bg-white text-base font-medium text-ink";
