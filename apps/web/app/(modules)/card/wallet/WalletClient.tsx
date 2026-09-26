"use client";
// 명함함. 최근 순 목록, 탭하면 펼친다. 내가 찍은 것과 받은 것을 표시로 구분한다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";
import type { Card } from "@/app/api/card/_lib";
import CardView from "../CardView";

type WalletData = { cards: Card[]; received_count: number };

function when(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export default function WalletClient() {
  const [data, setData] = useState<WalletData | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api<WalletData>("/api/card/wallet").then((r) => r.ok && setData(r.data));
  }, []);

  if (!data) return <Loading text="명함함 여는 중" />;

  return (
    <>
      <TopBar title={`명함함 ${data.cards.length}`} right={[{ href: "/card", label: "내 명함" }]} />
      <main className="space-y-3 p-4">
        <p className="text-xs text-gray-500">
          내가 찍은 것 {data.cards.length - data.received_count}장 · 받은 것 {data.received_count}장
        </p>
        {data.cards.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center">
            <p className="text-sm text-gray-600">아직 명함이 없다</p>
            <Link href="/card/scan" className="mt-3 inline-block rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white">
              명찰 QR 찍기
            </Link>
          </div>
        )}
        <ul className="space-y-2">
          {data.cards.map((c) => {
            const expanded = open === c.id;
            return (
              <li key={c.id}>
                {expanded ? (
                  <div onClick={() => setOpen(null)} className="cursor-pointer">
                    <CardView card={c} />
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
                      <span className={`rounded px-1 ${c.source === "auto" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-600"}`}>{c.source === "auto" ? "받음" : "찍음"}</span>
                      <span className="ml-1">{when(c.exchanged_at)}</span>
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
