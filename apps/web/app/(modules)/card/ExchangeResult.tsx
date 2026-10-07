"use client";
// 교환 결과 화면. /card?p=<id>(내장 카메라) 와 /card/scan(앱 스캐너) 둘 다 이 화면을 쓴다.
// payload 를 받으면 한 번만 scan API 를 부른다.
// v0.2 H-05: QR 은 바로 성립, 이름 검색(manual)은 상대 확인을 기다린다. 성립하면 오늘 처음 대화한 분인가요? 를 한 번 묻는다(FirstMeetAsk).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";
import type { Card } from "@/app/api/card/_lib";
import CardView from "./CardView";
import FirstMeetAsk from "./FirstMeetAsk";

type ScanData = { card: Card; already_saved: boolean; status: "pending" | "confirmed"; ask_first_meet: boolean };

const ERROR_TITLE: Record<string, string> = { SELF_SCAN: "내 명함이에요", TARGET_UNAVAILABLE: "이 분은 앱 명함 교환을 쓰지 않아요", CONSENT_REFUSED: "이용 동의를 하지 않아 교환할 수 없어요", NOT_FOUND: "ORBIT 명함 QR 이 아니에요" };
type State = { kind: "loading" } | { kind: "ok"; data: ScanData } | { kind: "error"; code: string; message: string };

export default function ExchangeResult({ payload, source = "qr", via, onDone }: { payload: string; source?: "qr" | "manual"; via?: "card" | "event"; onDone?: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api<ScanData>("/api/card/scan", { json: { qr_payload: payload, source, ...(via ? { via } : {}) } }).then((r) => {
      if (r.ok) {
        setState({ kind: "ok", data: r.data });
        window.dispatchEvent(new Event("orbit:inbox-changed")); // 추천 목록 · 받은 명함을 다시 읽게
      } else setState({ kind: "error", code: r.code, message: r.message });
    });
  }, [payload, source, via]);

  const backLabel = onDone ? "다시 찍기" : "내 명함으로";

  return (
    <>
      <TopBar title="명함 교환" right={[{ href: "/card/wallet", label: "받은 명함" }]} />
      <main className="space-y-4 p-4">
        {state.kind === "loading" && <Loading text="명함을 주고받는 중" />}
        {state.kind === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="font-semibold text-red-700">{ERROR_TITLE[state.code] ?? "교환하지 못했다"}</p>
            <p className="mt-1 text-sm text-red-700">{state.message}</p>
          </div>
        )}
        {state.kind === "ok" && (
          <>
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="font-semibold">
                {state.data.status === "pending"
                  ? `${state.data.card.display_name} 님의 확인을 기다리고 있어요`
                  : state.data.already_saved
                    ? "이미 교환한 명함이에요"
                    : `${state.data.card.display_name} 님과 명함을 주고받았다`}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {state.data.status === "pending"
                  ? "상대 화면에 교환하셨나요? 확인 카드가 떴다. 상대가 확인하면 교환이 끝난다"
                  : state.data.already_saved
                    ? "받은 명함에 그대로 있다"
                    : "내 명함도 상대에게 전달됐다. 상대 화면에 알림이 뜬다"}
              </p>
            </div>
            <CardView card={state.data.card} />
            {state.data.ask_first_meet && <FirstMeetAsk targetId={state.data.card.id} />}
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          {onDone ? (
            <button type="button" onClick={onDone} className="rounded-xl bg-black py-3 text-sm font-semibold text-white">
              {backLabel}
            </button>
          ) : (
            <Link href={`/card/scan${via ? `?via=${via}` : ""}`} className="rounded-xl bg-black py-3 text-center text-sm font-semibold text-white">
              다른 명찰 찍기
            </Link>
          )}
          <Link href={onDone ? "/card" : "/card/wallet"} className="rounded-xl border border-gray-300 py-3 text-center text-sm font-semibold">
            {onDone ? "명함 탭으로" : "받은 명함 보기"}
          </Link>
        </div>
      </main>
    </>
  );
}
