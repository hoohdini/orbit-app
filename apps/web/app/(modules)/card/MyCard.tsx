"use client";
// 명함 탭(개발 지시서 v0.2 H-02 ~ H-06). 앱을 열면 보이는 기본 탭이다. 위에서 아래로 내 명함, 스캔하기, 오늘 만나면 좋을 분, 받은 명함.
// 추천에서 교환한 사람은 받은 명함으로 내려간다. 명함 편집(공개 범위, 링크)은 마이페이지(/my, M-01)로 옮겼다.
// 동의를 거부한 사람은 내 명함만 보이고 교환 · 추천은 쓰지 않는다(API 가 막는다).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import { useOrbitState } from "@/components/useOrbitState";
import type { Card } from "@/app/api/card/_lib";
import CardView from "./CardView";
import ReceivedCards from "./ReceivedCards";

type MeData = { card: Card; visibility: string; qr_payload: string; wallet_count: number; unseen_count: number };
type RecPerson = { id: string; display_name: string; affiliation: string | null; role: string; cohort: number | null; career_line: string };
type Recs = { folded: boolean; people: RecPerson[]; almost_done: boolean };

const WALLET_PREVIEW = 5;
const RECS_POLL_MS = 30_000;

export default function MyCard() {
  const state = useOrbitState();
  const [me, setMe] = useState<MeData | null>(null);
  const [wallet, setWallet] = useState<Card[] | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const refused = state?.consent === "refused";

  const loadWallet = useCallback(() => {
    api<{ cards: Card[] }>("/api/card/wallet").then((r) => r.ok && setWallet(r.data.cards));
  }, []);

  useEffect(() => {
    api<MeData>("/api/card/me").then((r) => r.ok && setMe(r.data));
    loadWallet();
    window.addEventListener("orbit:inbox-changed", loadWallet);
    return () => window.removeEventListener("orbit:inbox-changed", loadWallet);
  }, [loadWallet]);

  if (!me) return <Loading text="내 명함 불러오는 중" />;

  return (
    <main className="space-y-5 p-4">
      <section>
        <button type="button" onClick={() => setQrOpen(true)} className="block w-full text-left" aria-label="내 명함 QR 크게 보기">
          <CardView card={me.card} mine />
        </button>
        <p className="mt-1 text-center text-[11px] text-gray-400">명함을 누르면 QR 이 크게 뜬다</p>
      </section>

      {refused ? (
        <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
          이용 동의를 하지 않아 명함 교환과 추천을 쓸 수 없다.{" "}
          <Link href="/my" className="underline">
            마이페이지
          </Link>
          에서 다시 동의할 수 있다
        </p>
      ) : (
        <>
          <Link href="/card/scan?via=card" className="block rounded-2xl bg-black py-5 text-center text-lg font-bold text-white">
            스캔하기
          </Link>
          <RecsSection />
        </>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">받은 명함 {wallet ? wallet.length : ""}</h2>
          {wallet && wallet.length > WALLET_PREVIEW && (
            <Link href="/card/wallet" className="text-xs underline">
              모두 보기
            </Link>
          )}
        </div>
        <div className="mt-2">
          {wallet === null ? (
            <p className="text-xs text-gray-400">불러오는 중</p>
          ) : wallet.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-xs text-gray-500">아직 받은 명함이 없다</p>
          ) : (
            <ReceivedCards cards={wallet.slice(0, WALLET_PREVIEW)} />
          )}
        </div>
      </section>

      {qrOpen && <QrFullscreen payload={me.qr_payload} onClose={() => setQrOpen(false)} />}
    </main>
  );
}

// 오늘 만나면 좋을 분(H-04). 한 번에 3명, 순위 · 점수 · 근거 없이 이력 한 줄만. 세션 중에는 접힌다(서버가 단계로 판단).
function RecsSection() {
  const state = useOrbitState();
  const open = state?.recs_open ?? true;
  const [recs, setRecs] = useState<Recs | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api<Recs>("/api/card/recs").then((r) => alive && r.ok && setRecs(r.data));
    load();
    const t = setInterval(load, RECS_POLL_MS);
    window.addEventListener("orbit:inbox-changed", load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("orbit:inbox-changed", load);
    };
  }, [open]);

  return (
    <section>
      <h2 className="text-sm font-semibold">오늘 만나면 좋을 분</h2>
      <div className="mt-2">
        {!recs ? (
          <p className="text-xs text-gray-400">불러오는 중</p>
        ) : recs.folded ? (
          <p className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">세션이 끝나면 볼 수 있어요</p>
        ) : recs.people.length === 0 ? (
          <p className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">{recs.almost_done ? "오늘 거의 다 만나셨어요" : "곧 추천이 준비됩니다"}</p>
        ) : (
          <ul className="space-y-2">
            {recs.people.map((p) => (
              <li key={p.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-sm">
                  <span className="font-semibold">{p.display_name}</span>
                  {p.cohort != null && <span className="ml-1 text-gray-500">{p.cohort}기</span>}
                  {p.affiliation && <span className="ml-2 text-gray-500">{p.affiliation}</span>}
                </p>
                {p.career_line && <p className="mt-0.5 text-xs text-gray-600">{p.career_line}</p>}
              </li>
            ))}
            {recs.almost_done && <li className="text-center text-xs text-gray-400">오늘 거의 다 만나셨어요</li>}
          </ul>
        )}
      </div>
    </section>
  );
}

// 명함 QR 전면(H-02). 웹은 화면 밝기를 못 바꾸므로 흰 전면과 화면 꺼짐 방지(Wake Lock)로 대신한다.
function QrFullscreen({ payload, onClose }: { payload: string; onClose: () => void }) {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white" onClick={onClose} role="dialog" aria-modal="true">
      <QRCodeSVG value={payload} size={280} level="M" includeMargin />
      <p className="mt-4 text-sm text-gray-500">상대가 이 QR 을 찍으면 서로 명함을 주고받는다</p>
      <p className="mt-8 text-xs text-gray-400">화면을 누르면 닫힌다</p>
    </div>
  );
}
