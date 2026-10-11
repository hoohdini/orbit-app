"use client";
// 명함 편집(피그마 10/11). 미리보기(Pass) · 공개 범위(전체 공개 · 내가 찍은 사람만) · Offer · Seek · 연락처, 저장하기.
// 공개 범위는 저장하기를 눌러야 바뀐다(/api/card/settings). Offer · Seek 는 각 수정 화면에서 저장한다(/api/my/profile, 명함에만 반영).
// 연락처 링크 편집은 피그마에 없지만 명함 상세의 연락처가 여기서 정해지므로 줄 하나로 남겼다.
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import type { Card } from "@/app/api/card/_lib";
import { Notice, Row, RowGroup, Section, bigBtn } from "../ui";

type Profile = { offer_text: string; seek_text: string; topic_tags: string[]; edited: boolean; visibility: string; links: Record<string, string> };

export default function CardEdit() {
  const [p, setP] = useState<Profile | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [vis, setVis] = useState<"all" | "scanned">("all");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    api<Profile>("/api/my/profile").then((r) => {
      if (!r.ok) return;
      setP(r.data);
      setVis(r.data.visibility === "scanned" ? "scanned" : "all");
    });
    api<{ card: Card }>("/api/card/me").then((r) => r.ok && setCard(r.data.card));
  }, []);

  if (!p || !card) return <Loading />;

  async function save() {
    setState("saving");
    const r = await api("/api/card/settings", { json: { visibility: vis } });
    setState(r.ok ? "saved" : "error");
  }

  const linkCount = Object.values(p.links).filter(Boolean).length;
  return (
    <main className="space-y-5 px-5 py-7">
      <Section title="미리보기">
        <Pass card={card} />
      </Section>
      <Section title="공개 범위">
        <div className="flex gap-2">
          {(
            [
              ["all", "전체 공개"],
              ["scanned", "내가 찍은 사람만"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => (setVis(k), setState("idle"))} aria-pressed={vis === k} className={`h-9 rounded-full px-4 text-sm font-medium ${vis === k ? "bg-brand text-white" : "border border-navy bg-white text-ink-2"}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-3">연락처 링크를 {vis === "all" ? "명함을 가진 모든 분" : "내가 QR을 찍은 분"}에게 보여 줘요</p>
      </Section>
      <Section title="Offer · Seek">
        <RowGroup>
          <Row href="/my/card/offer" title="Offer" sub={p.offer_text || "비어 있어요"} trail="수정" />
          <Row href="/my/card/seek" title="Seek" sub={p.seek_text || "비어 있어요"} trail="수정" />
          <Row href="/my/card/links" title="연락처" sub={linkCount ? `${linkCount}개 등록됨` : "등록된 링크가 없어요"} trail="수정" />
        </RowGroup>
      </Section>
      <Notice>
        수정결과는 명함에만 반영되고,
        <br />
        오늘의 추천에는 반영되지 않습니다.
      </Notice>
      <button type="button" onClick={save} disabled={state === "saving"} className={bigBtn}>
        {state === "saving" ? "저장 중" : state === "saved" ? "저장했어요" : state === "error" ? "저장하지 못했어요. 다시 누르기" : "저장하기"}
      </button>
    </main>
  );
}

// 피그마 Pass(내 명함 = 여권 신원정보면). 남색 카드, 한글/영문 병기 라벨
function Pass({ card }: { card: Card }) {
  const field = card.label || card.offer_text.split(/[.\n]/)[0] || "-";
  return (
    <div className="mx-auto w-[251px] rounded-[18px] bg-brand p-[15px] shadow-[0_6px_9px_rgba(12,23,51,0.1)]">
      <div className="flex justify-between font-mono text-[6px] uppercase tracking-[0.45px] text-muted">
        <span>ORBIT PASS</span>
        <span>P / ORB / 2026</span>
      </div>
      <div className="mt-3 flex gap-3">
        <span className="flex h-[72px] w-[57px] shrink-0 items-center justify-center rounded-[9px] bg-[#1b2f5e] font-mono text-[9px] text-muted">{card.display_name.slice(0, 2)}</span>
        <div className="min-w-0 space-y-2">
          <div>
            <p className="text-[7px] text-muted">성명 / NAME</p>
            <p className="text-[10px] font-medium text-white">{card.display_name}</p>
          </div>
          <div className="flex gap-4">
            <div className="min-w-0">
              <p className="text-[7px] text-muted">분야 / FIELD</p>
              <p className="truncate text-[8px] font-medium text-white">{field}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[7px] text-muted">소속 / ORG</p>
              <p className="truncate text-[8px] font-medium text-white">{card.affiliation ?? "-"}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 h-px bg-[#3a4f86]" />
    </div>
  );
}
