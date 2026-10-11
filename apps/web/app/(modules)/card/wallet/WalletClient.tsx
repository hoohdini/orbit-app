"use client";
// 교환한 명함 목록(피그마 iPhone 16 - 7, v0.2 H-06). 최근 순, 위로 겹쳐 쌓인 카드. 누르면 명함 상세(/card/wallet/<id>).
// 칩: 전체 · 테이블 · 포스터 · 커피챗(교환 때 단계, 0013). 단계 기록이 없는 교환(other)은 전체에만 보인다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { Card, MetAt } from "@/app/api/card/_lib";
import { FILTERS, fieldLine, hhmm, metLabel, whoLine } from "../walletText";

type WalletData = { cards: Card[]; received_count: number };

export default function WalletClient() {
  const [data, setData] = useState<WalletData | null>(null);
  const [filter, setFilter] = useState<MetAt | "all">("all");

  useEffect(() => {
    const load = () => api<WalletData>("/api/card/wallet").then((r) => r.ok && setData(r.data));
    load();
    window.addEventListener("orbit:inbox-changed", load);
    return () => window.removeEventListener("orbit:inbox-changed", load);
  }, []);

  const cards = (data?.cards ?? []).filter((c) => filter === "all" || c.met === filter);

  return (
    <main className="pt-[10px]">
      <div className="flex gap-3 px-[19px]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-xl border border-black px-[10px] py-[7px] text-[13px] ${filter === f.key ? "bg-hero-to text-white" : "bg-white text-black"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="mt-10 text-center text-sm text-ink-3">불러오는 중</p>
      ) : cards.length === 0 ? (
        <div className="mx-3 mt-6 rounded-[25px] border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink-2">{data.cards.length === 0 ? "아직 교환한 명함이 없어요" : "여기에 해당하는 명함이 없어요"}</p>
          {data.cards.length === 0 && (
            <Link href="/card/scan?via=card" className="mt-4 inline-block rounded-2xl bg-navy px-5 py-3 text-sm font-bold text-white">
              명함 스캔하기
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-[18px] px-3">
          {cards.map((c, i) => (
            <li key={c.id} className="relative h-[178px]" style={{ marginTop: i === 0 ? 0 : -69, zIndex: i }}>
              <Link href={`/card/wallet/${c.id}`} className="absolute inset-0 block rounded-t-[25px] bg-[#fdfdfd] shadow-[inset_-4px_4px_4px_rgba(0,0,0,0.25)]">
                <span className="absolute left-[17px] right-[22px] top-[15px] flex justify-between text-xs text-black">
                  <span>{metLabel(c)}</span>
                  <span>{hhmm(c.exchanged_at)}</span>
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src="/figma/dsl-logo-list.svg" className="absolute left-[18px] top-[48px] h-[37px] w-[65px]" />
                <span className="absolute left-[101px] right-4 top-[48px] flex items-baseline gap-2 truncate">
                  <span className="text-xl font-medium text-black">{c.display_name}</span>
                  <span className="text-[13px] text-black">{whoLine(c)}</span>
                </span>
                <span className="absolute left-[104px] right-4 top-[82px] truncate text-sm text-navy">{fieldLine(c)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
