"use client";
// 교환 결과 화면. /card?p=<id>(내장 카메라) 와 /card/scan(앱 스캐너) 둘 다 이 화면을 쓴다.
// payload 를 받으면 한 번만 scan API 를 부른다.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";
import type { Card } from "@/app/api/card/_lib";
import CardView from "./CardView";

type ScanData = { card: Card; already_saved: boolean };
type State = { kind: "loading" } | { kind: "ok"; data: ScanData } | { kind: "error"; code: string; message: string };

export default function ExchangeResult({ payload, source = "qr", onDone }: { payload: string; source?: "qr" | "manual"; onDone?: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api<ScanData>("/api/card/scan", { json: { qr_payload: payload, source } }).then((r) => {
      if (r.ok) setState({ kind: "ok", data: r.data });
      else setState({ kind: "error", code: r.code, message: r.message });
    });
  }, [payload, source]);

  const backLabel = onDone ? "다시 찍기" : "내 명함으로";

  return (
    <>
      <TopBar title="명함 교환" right={[{ href: "/card/wallet", label: "명함함" }]} />
      <main className="space-y-4 p-4">
        {state.kind === "loading" && <Loading text="명함을 주고받는 중" />}
        {state.kind === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="font-semibold text-red-700">{state.code === "SELF_SCAN" ? "내 명함이다" : "교환하지 못했다"}</p>
            <p className="mt-1 text-sm text-red-700">{state.message}</p>
          </div>
        )}
        {state.kind === "ok" && (
          <>
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="font-semibold">{state.data.already_saved ? `${state.data.card.display_name} 님과는 이미 명함을 주고받았다` : `${state.data.card.display_name} 님과 명함을 주고받았다`}</p>
              <p className="mt-1 text-xs text-gray-500">
                {state.data.already_saved ? "명함함에 그대로 있다" : "내 명함도 상대에게 전달됐다. 상대 화면에 알림이 뜬다"}
              </p>
            </div>
            <CardView card={state.data.card} />
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          {onDone ? (
            <button type="button" onClick={onDone} className="rounded-xl bg-black py-3 text-sm font-semibold text-white">
              {backLabel}
            </button>
          ) : (
            <Link href="/card/scan" className="rounded-xl bg-black py-3 text-center text-sm font-semibold text-white">
              다른 명찰 찍기
            </Link>
          )}
          <Link href={onDone ? "/card" : "/card/wallet"} className="rounded-xl border border-gray-300 py-3 text-center text-sm font-semibold">
            {onDone ? "내 명함으로" : "명함함 보기"}
          </Link>
        </div>
      </main>
    </>
  );
}
