"use client";
// 하단 메뉴(개발 지시서 v0.2 결정 1: 명함 · 네트워킹 · 이벤트 · 마이페이지 4탭, 앱을 열면 명함 탭).
// 명함 항목에는 아직 안 본 받은 명함 알림과 이름 검색 교환 확인 요청 수를 배지로 붙인다(15초마다 /api/card/inbox 를 URL 로만 부른다. 모듈 코드는 import 하지 않는다).
// 예전 경로(/tabletalk · /coffeechat · /poster)도 해당 탭이 켜진 것으로 본다.
// 모양은 피그마 TabBar(10/11): 높이 84(아래 여백 28 포함), 아이콘 24, 활성 네이비 · 비활성 회색.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconCard, IconFlag, IconPeople, IconUser } from "./figma/Icons";

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
  { href: "/card", label: "명함", also: [] as string[], Icon: IconCard },
  { href: "/networking", label: "네트워킹", also: ["/tabletalk", "/coffeechat"], Icon: IconPeople },
  { href: "/event", label: "이벤트·미션", also: ["/poster"], Icon: IconFlag },
  { href: "/my", label: "마이", also: [] as string[], Icon: IconUser },
];

export default function BottomNav() {
  const path = usePathname();
  const inbox = useInboxCount();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 bg-white shadow-[0_-1px_0_rgba(12,23,51,0.06)]">
      <ul className="mx-auto flex h-[84px] max-w-md px-2 pt-2 pb-7">
        {items.map((it) => {
          const active = [it.href, ...it.also].some((h) => path === h || path.startsWith(`${h}/`));
          return (
            <li key={it.href} className="flex-1">
              <Link href={it.href} className={`flex h-full flex-col items-center justify-center gap-1 text-xs font-medium leading-4 ${active ? "text-brand" : "text-ink-3"}`}>
                <span className="relative">
                  <it.Icon />
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
