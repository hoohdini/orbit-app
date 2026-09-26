"use client";
// 하단 메뉴. 모든 모듈 화면 아래에 붙는다. 경로는 docs/MODULES.md 에 고정돼 있다.
// 명함 항목에는 아직 안 본 "명함이 공유되었습니다" 수를 배지로 붙인다(15초마다 /api/card/inbox 를 URL 로만 부른다. 모듈 코드는 import 하지 않는다).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const INBOX_POLL_MS = 15_000;

function useInboxCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/card/inbox", { cache: "no-store", credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => alive && b?.ok && setCount(Number(b.data?.count ?? 0)))
        .catch(() => {});
    load();
    const t = setInterval(load, INBOX_POLL_MS);
    window.addEventListener("orbit:inbox-changed", load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("orbit:inbox-changed", load);
    };
  }, []);
  return count;
}

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
  const inbox = useInboxCount();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md justify-between px-2 py-1">
        {items.map((it) => {
          const active = path === it.href || (it.href !== "/home" && path.startsWith(it.href));
          const base = "flex flex-col items-center px-2 py-1 text-[11px]";
          if ("disabled" in it && it.disabled) {
            return (
              <li key={it.href} className={`${base} text-gray-300`}>
                <span className="h-5 w-5 rounded-full bg-gray-200" />
                {it.label}
              </li>
            );
          }
          return (
            <li key={it.href}>
              <Link href={it.href} className={`${base} ${active ? "text-black font-semibold" : "text-gray-500"}`}>
                <span className="relative">
                  <span className={`block h-5 w-5 rounded-full ${active ? "bg-black" : "bg-gray-300"}`} />
                  {it.href === "/card" && inbox > 0 && (
                    <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{inbox > 9 ? "9+" : inbox}</span>
                  )}
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
