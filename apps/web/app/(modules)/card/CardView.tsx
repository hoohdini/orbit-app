"use client";
// 명함 한 장. 내 명함과 상대 명함이 같은 모양이다.
// 디자인은 주소 앞자리(theme 0~7)로 정해진다. 주소가 없으면 회색. 빈 항목은 자리만 남긴다(stage 1·2).
import type { Card } from "@/app/api/card/_lib";

export const THEMES: { name: string; bg: string; fg: string; sub: string; chip: string }[] = [
  { name: "회색", bg: "#f3f4f6", fg: "#111827", sub: "#4b5563", chip: "#ffffff" }, // 0 운영·미분류
  { name: "보라", bg: "#ede9fe", fg: "#3b0764", sub: "#6d28d9", chip: "#ffffff" }, // 1 언어모델·NLP
  { name: "주황", bg: "#ffedd5", fg: "#7c2d12", sub: "#c2410c", chip: "#ffffff" }, // 2 추천·커머스
  { name: "초록", bg: "#dcfce7", fg: "#14532d", sub: "#15803d", chip: "#ffffff" }, // 3
  { name: "하늘", bg: "#e0f2fe", fg: "#0c4a6e", sub: "#0369a1", chip: "#ffffff" }, // 4
  { name: "남색", bg: "#dbeafe", fg: "#1e3a8a", sub: "#1d4ed8", chip: "#ffffff" }, // 5 금융·시계열
  { name: "황토", bg: "#fef3c7", fg: "#78350f", sub: "#b45309", chip: "#ffffff" }, // 6 최적화·제조
  { name: "장미", bg: "#ffe4e6", fg: "#881337", sub: "#be123c", chip: "#ffffff" }, // 7 인과추론·연구
];
const EMPTY = { name: "빈 명함", bg: "#f9fafb", fg: "#9ca3af", sub: "#9ca3af", chip: "#ffffff" };

const roleLabel: Record<string, string> = { student: "재학생", alumni: "졸업생", professor: "교수", staff: "운영진", other: "참가자" };
const linkLabel: Record<string, string> = { linkedin: "LinkedIn", github: "GitHub", email: "이메일", url: "링크" };

export default function CardView({ card, mine = false, compact = false }: { card: Card; mine?: boolean; compact?: boolean }) {
  const t = card.theme === null ? EMPTY : THEMES[card.theme];
  const empty = card.stage === 1;
  const links = card.links ? Object.entries(card.links) : [];

  return (
    <div className="rounded-2xl border border-gray-200 p-4 shadow-sm" style={{ background: t.bg, color: t.fg }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-bold">{card.display_name}</p>
          <p className="truncate text-sm" style={{ color: t.sub }}>
            {card.affiliation ?? (empty ? "소속 미입력" : "소속 없음")} · {roleLabel[card.role] ?? card.role}
            {card.cohort ? ` · ${card.cohort}기` : ""}
          </p>
        </div>
        {/* 주소(SID) 숫자는 보여 주지 않는다(9/27 회의). 분야 이름표만 보여 준다 */}
        <div className="max-w-[45%] shrink-0 text-right">
          <p className="text-sm font-semibold leading-tight">{card.label ?? (card.sid ? "이름표 준비 중" : "발급 전")}</p>
        </div>
      </div>

      {!compact && (
        <div className="mt-3 space-y-2 text-sm">
          <Row label="지금 하는 일" value={card.offer_text} placeholder={empty ? "아직 채워지지 않았다" : "비어 있다"} sub={t.sub} />
          <Row label="오늘 찾는 사람" value={card.seek_text} placeholder={empty ? "아직 채워지지 않았다" : "비어 있다"} sub={t.sub} />
          {card.topic_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {card.topic_tags.map((tag) => (
                <span key={tag} className="rounded-full px-2 py-0.5 text-xs ring-1 ring-black/10" style={{ background: t.chip, color: t.fg }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {links.map(([k, v]) => (
            <a
              key={k}
              href={k === "email" ? `mailto:${v}` : v}
              target={k === "email" ? undefined : "_blank"}
              rel="noreferrer"
              className="rounded-lg px-2 py-1 underline ring-1 ring-black/10"
              style={{ background: t.chip, color: t.fg }}
            >
              {linkLabel[k] ?? k}
            </a>
          ))}
        </div>
      )}
      {!compact && links.length === 0 && !mine && card.stage >= 2 && (
        <p className="mt-3 text-[11px]" style={{ color: t.sub }}>
          링크는 상대가 공개한 범위에서만 보인다
        </p>
      )}
      {mine && card.stage < 3 && (
        <p className="mt-3 text-[11px]" style={{ color: t.sub }}>
          {card.stage === 1 ? "명단만 들어와 있다. 프로필이 채워지면 내용이, 주소가 발급되면 색이 정해진다" : "주소가 발급되면 명함 색과 라벨이 정해진다"}
        </p>
      )}
    </div>
  );
}

function Row({ label, value, placeholder, sub }: { label: string; value: string; placeholder: string; sub: string }) {
  return (
    <div>
      <p className="text-[11px]" style={{ color: sub }}>
        {label}
      </p>
      <p className={value ? "" : "italic opacity-60"}>{value || placeholder}</p>
    </div>
  );
}
