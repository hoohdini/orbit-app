"use client";
// 내 명함 화면. 명함, 명찰 QR, 공개 범위 토글, 링크 편집, 스캔·명함함 버튼.
import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";
import { LINK_KEYS, type Card, type CardLinks, type LinkKey } from "@/app/api/card/_lib";
import CardView from "./CardView";

type MeData = { card: Card; visibility: string; qr_payload: string; wallet_count: number; unseen_count: number };
const linkLabel: Record<LinkKey, string> = { linkedin: "LinkedIn", github: "GitHub", email: "이메일", url: "그 밖의 링크" };
const linkHint: Record<LinkKey, string> = { linkedin: "linkedin.com/in/…", github: "github.com/…", email: "name@example.com", url: "https://…" };

export default function MyCard() {
  const [me, setMe] = useState<MeData | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<LinkKey, string>>({ linkedin: "", github: "", email: "", url: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<MeData>("/api/card/me").then((r) => r.ok && setMe(r.data));
  }, []);

  if (!me) return <Loading text="내 명함 불러오는 중" />;

  async function setVisibility(v: "all" | "scanned") {
    if (!me || busy) return;
    setBusy(true);
    setError(null);
    const r = await api<{ visibility: string; links: CardLinks }>("/api/card/settings", { json: { visibility: v } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setMe({ ...me, visibility: r.data.visibility });
  }

  function openEdit() {
    if (!me) return;
    const cur = me.card.links ?? {};
    setDraft({ linkedin: cur.linkedin ?? "", github: cur.github ?? "", email: cur.email ?? "", url: cur.url ?? "" });
    setEditing(true);
  }

  async function saveLinks() {
    if (!me || busy) return;
    setBusy(true);
    setError(null);
    const r = await api<{ visibility: string; links: CardLinks }>("/api/card/settings", { json: { links: draft } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setMe({ ...me, card: { ...me.card, links: Object.keys(r.data.links).length > 0 ? r.data.links : null } });
    setEditing(false);
  }

  const isAll = me.visibility === "all";

  return (
    <>
      <TopBar title="내 명함" right={[{ href: "/card/wallet", label: `명함함 ${me.wallet_count}` }]} />
      <main className="space-y-4 p-4">
        <CardView card={me.card} mine />

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold">내 명찰 QR</p>
          <p className="mt-0.5 text-xs text-gray-500">상대가 이 QR 을 찍으면 서로 명함을 주고받는다. 명찰에 인쇄된 것과 같은 QR 이다</p>
          <div className="mt-3 flex justify-center">
            <QRCodeSVG value={me.qr_payload} size={200} level="M" includeMargin={false} />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">링크 공개 범위</p>
              <p className="mt-0.5 text-xs text-gray-500">{isAll ? "내 명함을 가진 누구에게나 링크가 보인다" : "내가 직접 찍은 사람에게만 링크가 보인다"}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isAll}
              disabled={busy}
              onClick={() => setVisibility(isAll ? "scanned" : "all")}
              className={`relative h-7 w-12 rounded-full transition ${isAll ? "bg-black" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${isAll ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">이름 · 소속 · 주소 · 하는 일 · 태그는 범위와 상관없이 명함을 가진 사람에게 보인다</p>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">링크</p>
            {!editing && (
              <button type="button" onClick={openEdit} className="text-sm underline">
                편집
              </button>
            )}
          </div>
          {editing ? (
            <div className="mt-2 space-y-2">
              {LINK_KEYS.map((k) => (
                <label key={k} className="block">
                  <span className="text-xs text-gray-500">{linkLabel[k]}</span>
                  <input
                    className="mt-0.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
                    value={draft[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                    placeholder={linkHint[k]}
                    inputMode={k === "email" ? "email" : "url"}
                    autoCapitalize="none"
                  />
                </label>
              ))}
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" disabled={busy} onClick={saveLinks} className="flex-1 rounded-lg bg-black py-2 text-sm font-semibold text-white disabled:bg-gray-300">
                  저장
                </button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-xs text-gray-500">{me.card.links ? `${Object.keys(me.card.links).length}개 등록됨. 명함 위에 표시된다` : "등록된 링크가 없다"}</p>
          )}
          {error && !editing && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/card/scan" className="rounded-xl bg-black py-3 text-center text-sm font-semibold text-white">
            명찰 QR 찍기
          </Link>
          <Link href="/card/wallet" className="rounded-xl border border-gray-300 py-3 text-center text-sm font-semibold">
            명함함 {me.wallet_count}
          </Link>
        </div>
      </main>
    </>
  );
}
