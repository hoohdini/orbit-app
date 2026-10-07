"use client";
// 받은 명함 목록(개발 지시서 v0.2 H-06). 최근 순, 누르면 펼친다. 명함 탭 맨 아래 섹션과 명함함(/card/wallet)이 같이 쓴다.
// 내가 찍은 것과 받은 것을 표시로 구분하고, 이름 검색 교환에서 상대 확인을 기다리는 것(status pending)은 따로 표시한다.
import { useState } from "react";
import type { Card } from "@/app/api/card/_lib";
import CardView from "./CardView";

function when(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function badge(c: Card): [string, string] {
  if (c.status === "pending") return ["확인 대기", "bg-gray-100 text-gray-500"];
  return c.source === "auto" ? ["받음", "bg-yellow-100 text-yellow-800"] : ["찍음", "bg-gray-100 text-gray-600"];
}

export default function ReceivedCards({ cards }: { cards: Card[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="space-y-2">
      {cards.map((c) => {
        const [label, cls] = badge(c);
        return (
          <li key={c.id}>
            {open === c.id ? (
              <div onClick={() => setOpen(null)} className="cursor-pointer space-y-1">
                <CardView card={c} />
                {c.note && <p className="px-1 text-xs text-gray-500">내 메모: {c.note}</p>}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(c.id)}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="font-medium">{c.display_name}</span>
                  <span className="ml-2 text-sm text-gray-500">{c.affiliation ?? "소속 없음"}</span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-gray-400">
                  <span className={`rounded px-1 ${cls}`}>{label}</span>
                  <span className="ml-1">{when(c.exchanged_at)}</span>
                </span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
