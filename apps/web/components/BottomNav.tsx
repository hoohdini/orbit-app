"use client";
// 하단 메뉴(개발 지시서 v0.2 결정 1: 명함 · 네트워킹 · 이벤트 · 마이페이지 4탭, 앱을 열면 명함 탭).
// 명함 항목에는 아직 안 본 받은 명함 알림과 이름 검색 교환 확인 요청 수를 배지로 붙인다(15초마다 /api/card/inbox 를 URL 로만 부른다. 모듈 코드는 import 하지 않는다).
// 예전 경로(/tabletalk · /coffeechat · /poster)도 해당 탭이 켜진 것으로 본다.
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
        .then((b) => alive && b?.ok && setCount(Number(b.data?.count ?? 0) + Number(b.data?.requests?.length ?? 0)))
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
  { href: "/card", label: "명함", also: [] as string[] },
  { href: "/networking", label: "네트워킹", also: ["/tabletalk", "/coffeechat"] },
  { href: "/event", label: "이벤트", also: ["/poster"] },
  { href: "/my", label: "마이", also: [] as string[] },
];

export default function BottomNav() {
  const path = usePathname();
  const inbox = useInboxCount();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md justify-around px-2 py-1">
        {items.map((it) => {
          const active = [it.href, ...it.also].some((h) => path === h || path.startsWith(`${h}/`));
          return (
            <li key={it.href}>
              <Link href={it.href} className={`flex flex-col items-center px-3 py-1 text-[11px] ${active ? "font-semibold text-black" : "text-gray-500"}`}>
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
