"use client";
// 마이페이지 탭 첫 화면(피그마 마이페이지 탭). 내 명함은 Pass 로 통일했다(10/11). 운영자에게는 운영 콘솔 줄을 더한다
import { useEffect, useState } from "react";
import { api, type Me } from "@/lib/client";
import Loading from "@/components/Loading";
import type { Card } from "@/app/api/card/_lib";
import Pass from "@/components/figma/Pass";
import { useFit } from "@/components/figma/useFit";
import { Row, RowGroup, Section } from "./ui";

export default function MyHome() {
  const [me, setMe] = useState<Me | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [passBox, zoom] = useFit<HTMLDivElement>(251, 1.35); // 폭에 맞춰 명함을 키운다(최대 1.35배)

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
      <div ref={passBox} className="w-full">
        <Pass card={card} zoom={zoom} />
      </div>
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
