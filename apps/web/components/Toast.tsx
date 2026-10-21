"use client";
// 성공 · 실패 · 안내 알림을 한 가지 모양으로 띄운다(할 일 98). 어디서든 toast("저장했어요") 를 부르면
// 루트 레이아웃의 <Toaster /> 가 하단 메뉴 바로 위에 2.4초 동안 보여 준다. Provider 없이 window 이벤트로 전한다
import { useEffect, useState } from "react";

export type ToastKind = "success" | "error" | "info";
type Item = { id: number; text: string; kind: ToastKind };

const EVENT = "orbit:toast";
let seq = 0;

export function toast(text: string, kind: ToastKind = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Item>(EVENT, { detail: { id: ++seq, text, kind } }));
}

const tone: Record<ToastKind, string> = {
  success: "bg-brand text-white",
  error: "bg-[#b42318] text-white",
  info: "bg-white text-ink border border-navy",
};
const mark: Record<ToastKind, string> = { success: "✓", error: "!", info: "i" };

export default function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const on = (e: Event) => {
      const it = (e as CustomEvent<Item>).detail;
      setItems((xs) => [...xs.slice(-2), it]); // 많아야 3개
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== it.id)), 2400);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[104px] z-50 mx-auto flex w-full max-w-md flex-col items-center gap-2 px-5">
      {items.map((it) => (
        <div key={it.id} role={it.kind === "error" ? "alert" : "status"} className={`flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-[0_6px_18px_rgba(20,35,74,0.18)] animate-[toast-in_0.18s_ease-out] ${tone[it.kind]}`}>
          <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
            {mark[it.kind]}
          </span>
          <span className="min-w-0 flex-1 break-keep">{it.text}</span>
        </div>
      ))}
    </div>
  );
}
