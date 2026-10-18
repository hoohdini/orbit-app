"use client";
// 교환 결과 카드(피그마 iPhone 16 - 15 · 16 · 17 의 Result Card). /card?p=<id>(내장 카메라)와 /card/scan(앱 스캐너) 둘 다 쓴다.
// payload 를 받으면 한 번만 scan API 를 부른다.
// v0.2 H-05: QR 은 바로 성립, 이름 검색(manual)은 상대 확인을 기다린다. 성립하면 오늘 처음 대화한 분인가요? 를 한 번 묻는다(FirstMeetAsk, 미션 ④).
// 피그마에 없던 상태(내 QR, 동의 거부자, 확인 대기, 첫 대화 질문)는 같은 카드 모양으로 더했다(피그마 복제본 '연결 보강' 섹션에 그려 둠).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { Card } from "@/app/api/card/_lib";
import FirstMeetAsk from "./FirstMeetAsk";

type ScanData = { card: Card; already_saved: boolean; status: "pending" | "confirmed"; ask_first_meet: boolean };
type State = { kind: "loading" } | { kind: "ok"; data: ScanData } | { kind: "error"; code: string; message: string };

const ERRORS: Record<string, [string, string]> = {
  NOT_FOUND: ["ORBIT QR이 아니에요", "행사 포스터나 명함의 QR을 찍어 주세요"],
  SELF_SCAN: ["내 명함 QR이에요", "상대의 명찰이나 화면에 뜬 QR을 찍어 주세요"],
  TARGET_UNAVAILABLE: ["이 분과는 앱으로 교환할 수 없어요", "앱 이용에 동의하지 않은 분이에요. 직접 인사를 나눠 주세요"],
  CONSENT_REFUSED: ["이용 동의가 필요해요", "마이페이지에서 동의하면 명함을 교환할 수 있어요"],
  CONSENT_REQUIRED: ["이용 동의가 필요해요", "마이페이지에서 동의하면 명함을 교환할 수 있어요"],
};

export function ResultCard({ title, body, children, action, onAction, actionHref, sub }: { title: string; body: string; children?: React.ReactNode; action: string; onAction?: () => void; actionHref?: string; sub?: React.ReactNode }) {
  const btn = "flex h-[52px] w-full items-center justify-center rounded-2xl bg-navy text-base font-bold text-white";
  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-3xl bg-white px-5 pt-[22px] pb-5 text-center text-ink">
      <p className="text-lg font-bold text-navy">{title}</p>
      <p className="text-sm text-ink-2">{body}</p>
      {children && <div className="mt-1 w-full">{children}</div>}
      <div className="h-1.5" />
      {actionHref ? (
        <Link href={actionHref} className={btn}>
          {action}
        </Link>
      ) : (
        <button type="button" onClick={onAction} className={btn}>
          {action}
        </button>
      )}
      {sub}
    </div>
  );
}

export default function ExchangeResult({ payload, source = "qr", via, onDone }: { payload: string; source?: "qr" | "manual"; via?: "card" | "event"; onDone?: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api<ScanData>("/api/card/scan", { json: { qr_payload: payload, source, ...(via ? { via } : {}) } }).then((r) => {
      if (r.ok) {
        setState({ kind: "ok", data: r.data });
        window.dispatchEvent(new Event("orbit:inbox-changed")); // 추천 목록 · 교환한 명함을 다시 읽게
      } else setState({ kind: "error", code: r.code, message: r.message });
    });
  }, [payload, source, via]);

  // 스캐너 안에서는 확인 = 계속 찍기, 내장 카메라로 열었으면 명함 탭으로
  const close = onDone ? { onAction: onDone } : { actionHref: "/card" };
  const walletLink = (
    <Link href="/card/wallet" className="mt-1 text-xs text-ink-3 underline">
      교환한 명함 목록 보기
    </Link>
  );

  if (state.kind === "loading") {
    return <div className="w-full rounded-3xl bg-white px-5 py-8 text-center text-sm text-ink-2">명함을 주고받는 중이에요</div>;
  }
  if (state.kind === "error") {
    const [title, body] = ERRORS[state.code] ?? ["교환하지 못했어요", state.message];
    return <ResultCard title={title} body={body} action={state.code === "NOT_FOUND" || state.code === "SELF_SCAN" ? "다시 찍기" : "확인"} {...close} />;
  }

  const { card, status, already_saved, ask_first_meet } = state.data;
  const name = card.display_name;
  if (status === "pending") {
    return <ResultCard title={`${name}님의 확인을 기다리고 있어요`} body="상대 화면에 교환 확인 요청이 떴어요. 상대가 확인하면 교환이 끝나요" action="확인" {...close} sub={walletLink} />;
  }
  return (
    <ResultCard
      title={already_saved ? "이미 교환한 명함이에요" : "명함 교환이 완료되었어요"}
      body={already_saved ? `${name}님과는 이미 명함을 주고받았어요` : `두 번 교환할 필요 없이 ${name}님도 바로 교환돼요`}
      action="확인"
      {...close}
      sub={walletLink}
    >
      {ask_first_meet && <FirstMeetAsk targetId={card.id} />}
    </ResultCard>
  );
}
