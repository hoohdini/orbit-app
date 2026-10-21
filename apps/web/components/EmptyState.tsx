// 빈 상태 공통 컴포넌트(할 일 100). 문구만 넘기면 어디서나 같은 모양(남색 점선 상자, 제목 · 설명 · 버튼)이 된다.
// 문구 초안은 components/emptyCopy.ts 에 모아 둔다. compact 는 목록 안 한 줄 자리용
import Link from "next/link";
import type { EmptyCopy } from "./emptyCopy";

export default function EmptyState({ copy, compact = false }: { copy: EmptyCopy; compact?: boolean }) {
  if (compact) {
    return (
      <div className="py-3 text-xs text-ink-3">
        <p>{copy.title}</p>
        {copy.body && <p className="mt-0.5 text-ink-3/80">{copy.body}</p>}
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-dashed border-navy px-6 py-8 text-center">
      <p className="text-sm font-medium text-ink-2">{copy.title}</p>
      {copy.body && <p className="mt-1.5 break-keep text-xs leading-relaxed text-ink-3">{copy.body}</p>}
      {copy.action && (
        <Link href={copy.action.href} className="mt-4 inline-flex h-12 items-center rounded-2xl bg-navy px-5 text-sm font-bold text-white">
          {copy.action.label}
        </Link>
      )}
    </div>
  );
}
