"use client";
// 앱 스캐너(피그마 iPhone 16 - 15 · 16 · 17). 읽은 문자열이 명함 QR(/card?p=)이면 교환하고, 포스터 QR(/poster?c=)이면 그 화면으로 보낸다.
// 결과는 원 아래 흰 카드(ExchangeResult)로 띄우고, 확인을 누르면 계속 찍는다.
// 카메라를 못 쓰면 이름으로 찾아 교환한다(source manual, 상대가 확인해야 성립). 피그마에서는 내 명함 QR 화면에 있던 링크를 여기로 옮겼다(10/11 검토).
// v0.2 H-05: 앱 전체에서 카메라 진입점은 이 화면 하나다. 이벤트 탭 QR 버튼도 여기로 온다(via=event). via 는 탭 불일치 집계에만 쓴다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import QrScanner from "@/components/QrScanner";
import Eclipse from "@/components/figma/Eclipse";
import { parseCardId } from "@/app/api/card/_lib";
import DarkScreen from "../DarkScreen";
import ExchangeResult, { ResultCard } from "../ExchangeResult";

type Person = { id: string; display_name: string; affiliation: string | null };

function posterPath(text: string, via: "card" | "event"): string | null {
  try {
    const u = new URL(text);
    if (u.pathname.endsWith("/poster") && u.searchParams.get("c")) return `/poster?c=${encodeURIComponent(u.searchParams.get("c")!)}&via=${via}`;
  } catch {}
  return null;
}

export default function ScanClient({ via }: { via: "card" | "event" }) {
  const router = useRouter();
  const [target, setTarget] = useState<{ payload: string; source: "qr" | "manual"; n: number } | null>(null);
  const [notQr, setNotQr] = useState(false);
  const [denied, setDenied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);

  const query = q.trim();
  useEffect(() => {
    if (query.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      api<{ people: Person[] }>(`/api/card/search?q=${encodeURIComponent(query)}`).then((r) => alive && r.ok && setPeople(r.data.people));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);
  const shown = query.length >= 2 ? people : null;
  const busy = target !== null || notQr;

  function onDecode(text: string) {
    if (busy) return;
    if (parseCardId(text)) return setTarget({ payload: text, source: "qr", n: Date.now() });
    const poster = posterPath(text, via);
    if (poster) return router.push(poster);
    setNotQr(true);
  }

  const reset = () => {
    setTarget(null);
    setNotQr(false);
  };

  return (
    <DarkScreen
      title="QR 스캔"
      close={via === "event" ? "/event" : "/card"}
      footer={
        <div className="pb-2">
        {target ? (
          <ExchangeResult key={target.n} payload={target.payload} source={target.source} via={via} onDone={reset} />
        ) : notQr ? (
          <ResultCard title="ORBIT QR이 아니에요" body="행사 포스터나 명함의 QR을 찍어 주세요" action="다시 찍기" onAction={reset} />
        ) : searchOpen || denied ? (
          <section className="rounded-3xl bg-white p-5 text-ink">
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-navy">이름으로 찾기</p>
              {!denied && (
                <button type="button" onClick={() => setSearchOpen(false)} className="text-sm text-ink-3">
                  닫기
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-3">이름으로 교환하면 상대가 확인해야 교환이 끝나요</p>
            <input
              className="mt-3 w-full rounded-xl bg-field px-4 py-3 text-base text-ink outline-none ring-navy placeholder:text-ink-3 focus:ring-1"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름 두 글자 이상"
              maxLength={20}
            />
            {shown && (
              <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto">
                {shown.length === 0 && <li className="py-3 text-xs text-ink-3">입장한 사람 중에 없어요</li>}
                {shown.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setTarget({ payload: p.id, source: "manual", n: Date.now() })} className="flex w-full items-center justify-between py-3 text-left text-sm">
                      <span>
                        <span className="font-bold">{p.display_name}</span>
                        <span className="ml-2 text-ink-2">{p.affiliation ?? "소속 없음"}</span>
                      </span>
                      <span className="text-xs text-accent">교환 요청</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <div className="pb-6 text-center">
            <p className="text-[15px] font-medium">명찰이나 포스터의 QR을 원 안에 맞춰 주세요</p>
            <button type="button" onClick={() => setSearchOpen(true)} className="mt-3 text-sm font-medium text-muted underline">
              카메라를 쓸 수 없나요? 이름으로 찾기
            </button>
          </div>
        )}
        </div>
      }
    >
      <Eclipse>
        <QrScanner onDecode={onDecode} onDenied={() => setDenied(true)} paused={busy} />
      </Eclipse>
    </DarkScreen>
  );
}
