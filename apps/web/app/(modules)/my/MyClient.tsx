"use client";
// 마이페이지(개발 지시서 v0.2 M-01 ~ M-03).
// M-01 명함 편집: 링크 공개 범위(전체 · 내가 찍은 사람만), 링크 편집. 예전 명함 화면에서 옮겼다
// M-02 내 정보: 하는 일 · 찾는 사람 · 관심 태그 확인(수정 API 는 P2 라 아직 없다)
// M-03 개인정보 · 로그아웃: 동의 상태와 다시 동의 · 동의 철회, 사용설명서, 로그아웃. 운영자는 운영 콘솔 링크
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Me } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";
import { refreshOrbitState } from "@/components/useOrbitState";
import { LINK_KEYS, type Card, type CardLinks, type LinkKey } from "@/app/api/card/_lib";

type MeData = Me & { consent?: "agreed" | "refused" | "pending" };
type CardMe = { card: Card; visibility: string };
const linkLabel: Record<LinkKey, string> = { linkedin: "LinkedIn", github: "GitHub", email: "이메일", url: "그 밖의 링크" };
const linkHint: Record<LinkKey, string> = { linkedin: "linkedin.com/in/…", github: "github.com/…", email: "name@example.com", url: "https://…" };

export default function MyClient() {
  const [me, setMe] = useState<MeData | null>(null);
  const [card, setCard] = useState<CardMe | null>(null);

  useEffect(() => {
    api<MeData>("/api/onboarding/me").then((r) => r.ok && setMe(r.data));
    api<CardMe>("/api/card/me").then((r) => r.ok && setCard(r.data));
  }, []);

  if (!me || !card) return <Loading />;

  return (
    <>
      <TopBar title="마이페이지" />
      <main className="space-y-4 p-4">
        <CardSettings card={card} onChange={setCard} />
        <Profile me={me} />
        <Privacy me={me} onChange={(consent) => setMe({ ...me, consent, consented: consent === "agreed" })} />
        <section className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          <Link href="/home/guide" className="block px-4 py-3 text-sm">
            사용설명서
          </Link>
          {me.participant.is_admin && (
            <Link href="/ops" className="block px-4 py-3 text-sm">
              운영 콘솔
            </Link>
          )}
          <a href="/logout" className="block px-4 py-3 text-sm text-gray-600">
            로그아웃
          </a>
        </section>
      </main>
    </>
  );
}

function CardSettings({ card, onChange }: { card: CardMe; onChange: (c: CardMe) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<LinkKey, string>>({ linkedin: "", github: "", email: "", url: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAll = card.visibility === "all";

  async function setVisibility(v: "all" | "scanned") {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await api<{ visibility: string; links: CardLinks }>("/api/card/settings", { json: { visibility: v } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onChange({ ...card, visibility: r.data.visibility });
  }

  function openEdit() {
    const cur = card.card.links ?? {};
    setDraft({ linkedin: cur.linkedin ?? "", github: cur.github ?? "", email: cur.email ?? "", url: cur.url ?? "" });
    setEditing(true);
  }

  async function saveLinks() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await api<{ visibility: string; links: CardLinks }>("/api/card/settings", { json: { links: draft } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onChange({ ...card, card: { ...card.card, links: Object.keys(r.data.links).length > 0 ? r.data.links : null } });
    setEditing(false);
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">명함 편집</h2>
        <Link href="/card" className="text-xs underline">
          미리보기
        </Link>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="text-sm">링크 공개 범위</p>
          <p className="mt-0.5 text-xs text-gray-500">{isAll ? "내 명함을 가진 누구에게나 링크가 보인다" : "내가 직접 찍은 사람에게만 링크가 보인다"}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isAll}
          disabled={busy}
          onClick={() => setVisibility(isAll ? "scanned" : "all")}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${isAll ? "bg-black" : "bg-gray-300"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${isAll ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm">링크</p>
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
        <p className="mt-1 text-xs text-gray-500">{card.card.links ? `${Object.keys(card.card.links).length}개 등록됨. 명함 위에 표시된다` : "등록된 링크가 없다"}</p>
      )}
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}

function Profile({ me }: { me: MeData }) {
  const p = me.profile;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold">내 정보</h2>
      <dl className="mt-2 space-y-2 text-sm">
        <div>
          <dt className="text-xs text-gray-500">지금 하는 일</dt>
          <dd>{p?.offer_text || "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">오늘 찾는 사람 · 이야기</dt>
          <dd>{p?.seek_text || "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">관심 태그</dt>
          <dd>{p?.topic_tags?.length ? p.topic_tags.join(", ") : "-"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] text-gray-400">사전 등록 때 적은 내용이다. 오늘의 추천은 이 내용으로 미리 계산해 두었다</p>
    </section>
  );
}

function Privacy({ me, onChange }: { me: MeData; onChange: (c: "agreed" | "refused") => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agreed = me.consent ? me.consent === "agreed" : me.consented;

  async function set(next: boolean) {
    setBusy(true);
    setError(null);
    const r = await api<{ consent: "agreed" | "refused" }>("/api/onboarding/consent", { json: { agreed: next } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onChange(r.data.consent);
    refreshOrbitState();
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold">개인정보</h2>
      <p className="mt-1 text-sm">{agreed ? "이용 동의를 했다" : "이용 동의를 하지 않았다"}</p>
      <p className="mt-0.5 text-xs text-gray-500">
        {agreed ? "명함 교환, 추천, 미션 기록에 쓰이고 행사 뒤 30일에 지운다" : "자리 안내와 식순만 볼 수 있다. 명함 교환, 추천, 미션은 쓸 수 없다"}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => set(!agreed)}
        className={`mt-3 w-full rounded-lg py-2 text-sm ${agreed ? "border border-gray-300 text-gray-600" : "bg-black font-semibold text-white"}`}
      >
        {agreed ? "동의 철회" : "다시 동의하기"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
