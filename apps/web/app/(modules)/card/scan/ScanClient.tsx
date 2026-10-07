"use client";
// 앱 스캐너. 읽은 문자열이 명함 QR(/card?p=)이면 교환하고, 포스터 QR(/poster?c=)이면 그 화면으로 보낸다.
// 카메라를 못 쓰면 이름으로 찾아 교환한다(source manual, 상대가 확인해야 성립).
// v0.2 H-05: 앱 전체에서 카메라 진입점은 이 화면 하나다. 이벤트 탭 QR 버튼도 여기로 온다(via=event). via 는 탭 불일치 집계에만 쓴다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import QrScanner from "@/components/QrScanner";
import { parseCardId } from "@/app/api/card/_lib";
import ExchangeResult from "../ExchangeResult";

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
  const [target, setTarget] = useState<{ payload: string; source: "qr" | "manual" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
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

  function onDecode(text: string) {
    if (parseCardId(text)) {
      setNotice(null);
      setTarget({ payload: text, source: "qr" });
      return;
    }
    const poster = posterPath(text, via);
    if (poster) return router.push(poster);
    setNotice("ORBIT QR 이 아니에요");
  }

  if (target) return <ExchangeResult payload={target.payload} source={target.source} via={via} onDone={() => setTarget(null)} />;

  return (
    <>
      <TopBar title="QR 스캔" right={[{ href: via === "event" ? "/event" : "/card", label: "닫기" }]} />
      <main className="space-y-4 p-4">
        <QrScanner onDecode={onDecode} onDenied={() => setDenied(true)} />
        {notice && <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{notice}</p>}
        <p className="text-xs text-gray-500">상대 명찰의 QR 을 네모 안에 맞춘다. 읽히면 바로 서로 명함을 주고받는다. 포스터 QR 을 찍으면 관심 이유 화면으로 간다</p>

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold">{denied ? "이름으로 찾기" : "카메라가 안 되면 이름으로 찾기"}</p>
          <input
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름 두 글자 이상"
            maxLength={20}
          />
          {shown && (
            <ul className="mt-2 divide-y divide-gray-100">
              {shown.length === 0 && <li className="py-2 text-xs text-gray-400">입장한 사람 중에 없다</li>}
              {shown.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setTarget({ payload: p.id, source: "manual" })}
                    className="flex w-full items-center justify-between py-2 text-left text-sm"
                  >
                    <span>
                      <span className="font-medium">{p.display_name}</span>
                      <span className="ml-2 text-gray-500">{p.affiliation ?? "소속 없음"}</span>
                    </span>
                    <span className="text-xs text-gray-400">교환 요청</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
