"use client";
// 교환한 명함 목록(피그마 iPhone 16 - 7, v0.2 H-06). 최근 순. 누르면 명함 상세(/card/wallet/<id>).
// 칩: 전체 · 테이블 · 포스터 · 커피챗(교환 때 단계, 0013). 단계 기록이 없는 교환(other)은 전체에만 보인다.
// 10/11 일관성 정리: 겹쳐 쌓인 카드 대신 다른 탭과 같은 남색 테두리 목록(어디서 만났나 · 시각 / 로고 · 이름 · 구분 / 관심 분야)
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
    <main className="space-y-4 px-5 pt-4 pb-4">
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium ${filter === f.key ? "bg-brand text-white" : "border border-navy bg-white text-ink-2"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="pt-6 text-center text-sm text-ink-3">불러오는 중</p>
      ) : cards.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-navy p-8 text-center">
          <p className="text-sm text-ink-2">{data.cards.length === 0 ? "아직 교환한 명함이 없어요" : "여기에 해당하는 명함이 없어요"}</p>
          {data.cards.length === 0 && (
            <Link href="/card/scan?via=card" className="mt-4 inline-flex h-12 items-center rounded-2xl bg-navy px-5 text-sm font-bold text-white">
              명함 스캔하기
            </Link>
          )}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-3xl border border-navy bg-white py-1">
          {cards.map((c, i) => (
            <li key={c.id} className={i < cards.length - 1 ? "border-b border-navy" : ""}>
              <Link href={`/card/wallet/${c.id}`} className="block px-5 py-3.5">
                <span className="flex justify-between text-xs text-ink-2">
                  <span className={c.status === "pending" ? "font-medium text-accent" : ""}>{metLabel(c)}</span>
                  <span>{hhmm(c.exchanged_at)}</span>
                </span>
                <span className="mt-1.5 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" src="/figma/dsl-logo-list.svg" className="h-[30px] w-[52px] shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-ink">{c.display_name}</span>
                      <span className="truncate text-[13px] text-ink-2">{whoLine(c)}</span>
                    </span>
                    <span className="block truncate text-sm text-accent">{fieldLine(c)}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
