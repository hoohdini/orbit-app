// 상단 바. 제목과 오른쪽 링크(사용설명서 등).
import Link from "next/link";

export default function TopBar({ title, right }: { title: string; right?: { href: string; label: string }[] }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
      <h1 className="text-lg font-bold">{title}</h1>
      <div className="flex gap-3 text-sm text-gray-600">
        {right?.map((r) => (
          <Link key={r.href} href={r.href} className="underline">
            {r.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
