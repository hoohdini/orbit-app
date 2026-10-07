"use client";
// 명함함(받은 명함 전체). 목록은 명함 탭 섹션과 같은 ReceivedCards 를 쓴다(v0.2 H-06).
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";
import type { Card } from "@/app/api/card/_lib";
import ReceivedCards from "../ReceivedCards";

type WalletData = { cards: Card[]; received_count: number };

export default function WalletClient() {
  const [data, setData] = useState<WalletData | null>(null);

  useEffect(() => {
    api<WalletData>("/api/card/wallet").then((r) => r.ok && setData(r.data));
  }, []);

  if (!data) return <Loading text="명함함 여는 중" />;

  return (
    <>
      <TopBar title={`받은 명함 ${data.cards.length}`} right={[{ href: "/card", label: "명함 탭" }]} />
      <main className="space-y-3 p-4">
        <p className="text-xs text-gray-500">
          내가 찍은 것 {data.cards.length - data.received_count}장 · 받은 것 {data.received_count}장
        </p>
        {data.cards.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center">
            <p className="text-sm text-gray-600">아직 명함이 없다</p>
            <Link href="/card/scan?via=card" className="mt-3 inline-block rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white">
              명찰 QR 찍기
            </Link>
          </div>
        )}
        <ReceivedCards cards={data.cards} />
      </main>
    </>
  );
}
