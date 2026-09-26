"use client";
// "OO 님에게 명함이 공유되었습니다" 알림. 명함 탭 화면 아래에 붙어 15초마다 새 교환을 물어본다.
// 닫으면 seen 처리한다. 푸시는 없고 폴링만 있다(궤도와 같은 방식).
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Card } from "@/app/api/card/_lib";
import CardView from "./CardView";

const POLL_MS = 15_000;
type Item = { exchange_id: number | null; message: string; card: Card };

export default function CardInbox() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ new: Item[] }>("/api/card/inbox").then((r) => {
        if (alive && r.ok) setItems(r.data.new);
      });
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (items.length === 0) return null;
  const first = items[0];

  async function dismiss(all = false) {
    const ids = all ? items.map((i) => i.exchange_id).filter((x): x is number => x !== null) : first.exchange_id !== null ? [first.exchange_id] : [];
    setItems((cur) => (all ? [] : cur.slice(1)));
    await api("/api/card/inbox/seen", { json: { exchange_ids: ids } });
    window.dispatchEvent(new Event("orbit:inbox-changed"));
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-md px-3">
      <div className="rounded-2xl border border-gray-300 bg-white p-3 shadow-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{first.message}</p>
          <button type="button" onClick={() => dismiss(false)} className="text-sm text-gray-400">
            닫기
          </button>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">상대가 내 명찰 QR 을 찍어서 서로 명함을 주고받았다. 명함함에 들어가 있다</p>
        <div className="mt-2">
          <CardView card={first.card} compact />
        </div>
        {items.length > 1 && (
          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
            <span>{items.length - 1}건 더 있다</span>
            <button type="button" onClick={() => dismiss(true)} className="underline">
              모두 확인
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
