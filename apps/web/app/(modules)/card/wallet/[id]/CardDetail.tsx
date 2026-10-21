"use client";
// 명함 상세보기(피그마 iPhone 16 - 8). 데이터는 /api/card/wallet 에서 이 사람 것을 고른다.
// FIELD 는 주소 이름표(label), 없으면 하는 일 첫 문장. 피그마의 개인 DB 칸은 연락처(공개 범위 안의 링크)로 이름을 바꿨다(10/11 검토).
// 메모는 /api/card/note 로 저장한다(오늘 처음 대화한 분 답은 건드리지 않음, 200자).
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { Card } from "@/app/api/card/_lib";
import { hhmm, metLabel } from "../../walletText";
import { toast } from "@/components/Toast";
import Loading from "@/components/Loading";

const LINKS: { key: "email" | "linkedin" | "github" | "url"; label: string }[] = [
  { key: "email", label: "이메일" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "github", label: "GitHub" },
  { key: "url", label: "링크" },
];

function firstSentence(t: string): string {
  return t.split(/(?<=[.!?。])\s|\n/)[0]?.trim() ?? "";
}

export default function CardDetail({ id }: { id: string }) {
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    api<{ cards: Card[] }>("/api/card/wallet").then((r) => {
      const c = r.ok ? (r.data.cards.find((x) => x.id === id) ?? null) : null;
      setCard(c);
      setNote(c?.note ?? "");
    });
  }, [id]);

  async function save() {
    setSaved("saving");
    const r = await api<{ note: string | null }>("/api/card/note", { json: { target_id: id, note: note.trim() } });
    setSaved(r.ok ? "saved" : "error");
    toast(r.ok ? "메모를 저장했어요" : "저장하지 못했어요. 다시 눌러 주세요", r.ok ? "success" : "error");
  }

  if (card === undefined) return <Loading />;
  if (card === null)
    return (
      <p className="mt-10 text-center text-sm text-ink-2">
        교환한 명함이 아니에요.{" "}
        <Link href="/card/wallet" className="underline">
          목록으로
        </Link>
      </p>
    );

  const field = card.label || firstSentence(card.offer_text) || "-";
  const links = LINKS.filter((l) => card.links?.[l.key]);
  const box = "rounded-2xl border border-navy p-[13px]";

  return (
    <main className="space-y-[14px] px-4 pt-[5px]">
      <section className="relative mx-[7px] flex h-[202px] overflow-hidden rounded-[14px] border border-[#e3e6ea] bg-white shadow-[0_6px_18px_rgba(20,36,74,0.1)]">
        <div className="relative w-[111px] shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src="/figma/dsl-logo-card.svg" className="absolute left-[21px] top-[23px] h-[34px] w-[60px]" />
          <p className="absolute left-[21px] top-[143px] text-[9px] font-bold leading-3 tracking-[1.08px] text-brand">
            DSL
            <br />
            GATHERING
            <br />
            NIGHT
          </p>
        </div>
        <div className="my-[21px] w-[1.5px] bg-brand" />
        <dl className="flex min-w-0 flex-1 flex-col gap-[9px] py-[21px] pl-5 pr-3">
          <Field k="NAME" v={card.display_name} cls="text-xl font-bold" />
          <Field k="FIELD" v={field} cls="text-xs font-medium" />
          <Field k="ORGANIZATION" v={card.affiliation ?? "-"} cls="text-xs font-medium" />
          <Field k="INTERESTS" v={card.topic_tags.join(" · ") || "-"} cls="text-[11px]" />
        </dl>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <TextBox label="Seek · 찾는 분" text={card.seek_text} />
        <TextBox label="Offer · 하는 일" text={card.offer_text} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <section className={`${box} min-h-[117px]`}>
          <p className="text-base font-bold text-navy">함께 있던 자리</p>
          <div className="mt-2 pl-[9px] text-sm leading-[26px] text-black">
            {card.together?.table_no ? <p>테이블 {card.together.table_no}번</p> : null}
            {card.together?.group_no ? <p>커피챗 {card.together.group_no}그룹</p> : null}
            {!card.together?.table_no && !card.together?.group_no && <p className="text-ink-3">같은 자리 이력 없음</p>}
          </div>
        </section>
        <section className={`${box} min-h-[117px]`}>
          <p className="text-base font-bold text-navy">연락처</p>
          {links.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {links.map((l) => {
                const v = card.links![l.key]!;
                return (
                  <a key={l.key} href={l.key === "email" ? `mailto:${v}` : v} target={l.key === "email" ? undefined : "_blank"} rel="noreferrer" className="flex h-9 items-center rounded-full border border-navy px-3 text-[13px] text-ink">
                    {l.label}
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-xs text-ink-3">공개한 연락처가 없어요</p>
          )}
        </section>
      </div>

      <section className={box}>
        <label htmlFor="memo" className="block px-[6px] text-base font-bold text-navy">
          메모
        </label>
        <textarea
          id="memo"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setSaved("idle");
          }}
          maxLength={200}
          rows={3}
          placeholder="이 분과 나눈 이야기를 적어 두세요(나만 봐요)"
          className="mt-1 w-full resize-none px-[6px] text-base text-ink outline-none placeholder:text-ink-3"
        />
        <p className="text-right text-[11px] text-ink-3">{note.length}/200</p>
      </section>
      <button type="button" onClick={save} disabled={saved === "saving"} className="flex h-14 w-full items-center justify-center rounded-2xl bg-navy text-base font-bold text-white disabled:bg-field disabled:text-ink-3">
        {saved === "saving" ? "저장 중" : saved === "saved" ? "저장했어요" : saved === "error" ? "저장하지 못했어요. 다시 누르기" : "메모 저장"}
      </button>
      <p className="text-center text-[11px] text-ink-3">
        {metLabel(card)} · {hhmm(card.exchanged_at)} 교환
      </p>
    </main>
  );
}

function Field({ k, v, cls }: { k: string; v: string; cls: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[8px] font-bold tracking-[1.12px] text-ink-3">{k}</dt>
      <dd className={`truncate text-ink ${cls}`}>{v}</dd>
    </div>
  );
}

function TextBox({ label, text }: { label: string; text: string }) {
  return (
    <section className="min-h-[105px] rounded-2xl border border-navy bg-strip px-4 py-[14px]">
      <p className="text-[13px] font-bold text-navy">{label}</p>
      <p className="mt-1 line-clamp-4 text-[13px] leading-[18px] text-ink">{text || "비어 있어요"}</p>
    </section>
  );
}
