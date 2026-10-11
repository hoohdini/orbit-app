"use client";
// 피그마 393 폭 좌표를 화면 폭에 맞춰 비율로 늘리고 줄이는 훅(10/11 모바일 비율 맞춤). ref 를 붙인 요소의 폭 / base 를 s 로 돌려준다.
// 너무 커지지 않게 max 로 막는다. 요소가 나중에 그려져도(로딩 뒤) 재도록 콜백 ref 를 쓴다. 재기 전에는 base 폭으로 본다
import { useCallback, useEffect, useState } from "react";

export function useFit<T extends HTMLElement>(base = 393, max = 1.15): [(el: T | null) => void, number, { w: number; h: number }] {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ w: base, h: 0 });
  const ref = useCallback((node: T | null) => setEl(node), []);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, Math.min(max, size.w / base), size];
}
