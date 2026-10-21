"use client";
// 탭 전환 시 스크롤 위치 보존(할 일 101). 경로별로 마지막 스크롤 위치를 sessionStorage 에 적어 두고,
// 다시 들어오면 그 자리로 돌려놓는다. 데이터가 늦게 그려져 화면이 짧으면 길어질 때까지 1.5초 동안 다시 시도한다
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const KEY = (path: string) => `orbit:scroll:${path}`;

function read(path: string): number {
  try {
    return Number(sessionStorage.getItem(KEY(path)) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function write(path: string, y: number) {
  try {
    sessionStorage.setItem(KEY(path), String(Math.round(y)));
  } catch {
    // 시크릿 모드 등에서 저장이 막혀도 화면은 그대로 둔다
  }
}

export default function ScrollKeeper() {
  const path = usePathname();

  useEffect(() => {
    const target = read(path);
    let raf = 0;
    const started = performance.now();
    const restore = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max >= target - 4 || performance.now() - started > 1500) {
        window.scrollTo(0, Math.min(target, Math.max(0, max)));
        return;
      }
      raf = requestAnimationFrame(restore);
    };
    if (target > 0) raf = requestAnimationFrame(restore);

    let t = 0;
    const onScroll = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => write(path, window.scrollY), 120);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
      // 떠날 때 다시 적지 않는다. 이동 직후에는 새 화면이 이미 맨 위로 올라가 있어 0 이 적힐 수 있다
    };
  }, [path]);

  return null;
}
