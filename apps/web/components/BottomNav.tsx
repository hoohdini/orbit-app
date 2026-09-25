"use client";
// 하단 메뉴. 모든 모듈 화면 아래에 붙는다. 경로는 docs/MODULES.md 에 고정돼 있다.
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/home", label: "홈" },
  { href: "/tabletalk", label: "테이블토크" },
  { href: "/card", label: "명함" },
  { href: "/poster", label: "스탬프" },
  { href: "/coffeechat", label: "커피챗" },
  { href: "/home/chat", label: "챗봇", disabled: true },
] as const;

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md justify-between px-2 py-1">
        {items.map((it) => {
          const active = path === it.href || (it.href !== "/home" && path.startsWith(it.href));
          const base = "flex flex-col items-center px-2 py-1 text-[11px]";
          if ("disabled" in it && it.disabled) {
            return (
              <li key={it.href} className={`${base} text-gray-300`} aria-disabled>
                <span className="h-5 w-5 rounded-full bg-gray-200" />
                {it.label}
              </li>
            );
          }
          return (
            <li key={it.href}>
              <Link href={it.href} className={`${base} ${active ? "text-black font-semibold" : "text-gray-500"}`}>
                <span className={`h-5 w-5 rounded-full ${active ? "bg-black" : "bg-gray-300"}`} />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
