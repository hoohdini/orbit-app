"use client";
// 마이페이지 탭 첫 화면(피그마 마이페이지 탭 · 명함 시안 A). 운영자에게는 운영 콘솔 줄을 더한다
import { useEffect, useState } from "react";
import { api, type Me } from "@/lib/client";
import Loading from "@/components/Loading";
import type { Card } from "@/app/api/card/_lib";
import { Row, RowGroup, Section } from "./ui";

export default function MyHome() {
  const [me, setMe] = useState<Me | null>(null);
  const [card, setCard] = useState<Card | null>(null);

  useEffect(() => {
    api<Me>("/api/onboarding/me").then((r) => r.ok && setMe(r.data));
    api<{ card: Card }>("/api/card/me").then((r) => r.ok && setCard(r.data.card));
  }, []);

  if (!me || !card) return <Loading />;
  return (
    <main className="space-y-6 px-5 py-7">
      <div className="flex items-center gap-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="DSL" src="/figma/dsl-logo-list.svg" className="h-[45px] w-[78px]" />
        <p className="leading-tight">
          <span className="block text-[11px] text-ink-2">2026</span>
          <span className="block text-xl font-bold text-ink">DSL Gathering Night</span>
          <span className="block text-xl font-bold text-accent">: The ORBIT</span>
        </p>
      </div>
      <CardA card={card} />
      <Section title="내 계정">
        <RowGroup>
          <Row href="/my/card" title="명함 편집" sub="미리보기 · 공개 범위 · Offer · Seek" />
          <Row href="/my/info" title="내 정보" sub="동의 상태 · 사용설명서 · 로그아웃" />
          {me.participant.is_admin && <Row href="/ops" title="운영 콘솔" sub="운영진 전용" />}
        </RowGroup>
      </Section>
    </main>
  );
}

// 피그마 명함 (시안 A) 클래식. 이름 · 분야 · 소속 · 관심 태그, 아래 남색 띠
export function CardA({ card }: { card: Card }) {
  const field = card.label || card.offer_text.split(/[.\n]/)[0] || "";
  return (
    <div className="relative h-[202px] overflow-hidden rounded-[14px] border border-[#e3e6ea] bg-white px-[22px] pt-[22px] shadow-[0_6px_18px_rgba(20,36,74,0.1)]">
      <div className="flex items-start justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src="/figma/dsl-logo-card.svg" className="h-[30px] w-[53px]" />
        <span className="text-[9px] font-bold tracking-[1.2px] text-brand">THE ORBIT 2026</span>
      </div>
      <p className="mt-7 text-[26px] font-bold leading-[33px] text-ink">{card.display_name}</p>
      <p className="mt-1 truncate text-[13px] text-accent">{[field, card.affiliation].filter(Boolean).join(" · ")}</p>
      <div className="mt-4 h-px bg-line" />
      <p className="mt-3 flex items-center gap-3">
        <span className="text-[8px] font-bold tracking-[1.12px] text-ink-3">INTERESTS</span>
        <span className="truncate text-[11px] text-ink">{card.topic_tags.join(" · ") || "-"}</span>
      </p>
      <span className="absolute inset-x-0 bottom-0 h-[5px] bg-brand" />
    </div>
  );
}
