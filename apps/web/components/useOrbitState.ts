"use client";
// 참가자 화면 공용 상태(/api/state, 개발 지시서 v0.2 B-09)를 15초마다 한 번만 부르고 여러 컴포넌트가 나눠 쓴다.
// 상태 띠(H-01), 만족도 전면 카드(N-03), 추천 접힘(H-04), 새 배정 안내(N-06), 미션(E-01)이 이 훅을 쓴다.
// 운영자가 단계를 바꾸면 참가자 화면이 15초 안에 따라온다. 화면이 다시 보이면(탭 전환) 바로 한 번 더 부른다.
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export type OrbitState = {
  phase: string | null;
  phase_label: string;
  phase_at: string | null;
  notice: { text: string; expires_at: string } | null;
  consent: "agreed" | "refused" | "pending";
  tabletalk: { version: number; table_no: number; seat_no: number | null } | null;
  coffeechat: { version: number; group_no: number } | null;
  published: { tabletalk: number | null; coffeechat: number | null };
  recs_open: boolean;
  mission: { window: "not_started" | "open" | "closed"; done_count: number; total: number; progress: number };
  now: string;
};

const POLL_MS = 15_000;
let current: OrbitState | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(s: OrbitState) => void>();

async function load() {
  const r = await api<OrbitState>("/api/state");
  if (!r.ok) return;
  current = r.data;
  listeners.forEach((f) => f(r.data));
}

function onVisible() {
  if (document.visibilityState === "visible") load();
}

// 다른 화면이 상태를 바로 다시 읽게 하고 싶을 때(공개 확인, 교환 직후)
export function refreshOrbitState() {
  load();
}

export function useOrbitState(): OrbitState | null {
  const [s, setS] = useState<OrbitState | null>(current);
  useEffect(() => {
    listeners.add(setS);
    if (!timer) {
      load();
      timer = setInterval(load, POLL_MS);
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      listeners.delete(setS);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, []);
  return s;
}
