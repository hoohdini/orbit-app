"use client";
// 받은 쪽 알림. 명함 탭 아래에 붙어 15초마다 /api/card/inbox 를 물어본다. 푸시는 없고 폴링만 있다.
// 개발 지시서 v0.2 H-05:
// - requests: 상대가 이름 검색으로 보낸 교환. "OO님과 명함을 교환하셨나요?" 에 확인해야 성립한다(/api/card/confirm)
// - new: 상대가 내 명찰 QR 을 찍어 받은 명함. 찍힌 쪽도 미션 ④ 를 올릴 수 있게 오늘 처음 대화한 분인가요? 를 한 번 묻는다
// 닫으면 seen 처리한다.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Card } from "@/app/api/card/_lib";
import CardView from "./CardView";
import FirstMeetAsk from "./FirstMeetAsk";

const POLL_MS = 15_000;
type Item = { exchange_id: number | null; message: string; card: Card; ask_first_meet?: boolean };
type Inbox = { new: Item[]; requests: Item[] };

const changed = () => window.dispatchEvent(new Event("orbit:inbox-changed"));

export default function CardInbox() {
  const [inbox, setInbox] = useState<Inbox>({ new: [], requests: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<Inbox>("/api/card/inbox").then((r) => r.ok && setInbox({ new: r.data.new, requests: r.data.requests ?? [] })), []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const req = inbox.requests[0];
  const first = inbox.new[0];
  if (!req && !first) return null;

  async function confirm(accept: boolean) {
    if (!req?.exchange_id) return;
    setBusy(true);
    setError(null);
    const r = await api("/api/card/confirm", { json: { exchange_id: req.exchange_id, accept } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    await load();
    changed();
  }

  async function dismiss(all = false) {
    const ids = all ? inbox.new.map((i) => i.exchange_id).filter((x): x is number => x !== null) : first?.exchange_id != null ? [first.exchange_id] : [];
    setInbox((cur) => ({ ...cur, new: all ? [] : cur.new.slice(1) }));
    await api("/api/card/inbox/seen", { json: { exchange_ids: ids } });
    changed();
  }

  return (
    <div className="fixed inset-x-0 bottom-[124px] z-30 mx-auto max-w-md px-3">
      <div className="max-h-[70vh] overflow-y-auto rounded-3xl border border-line bg-white p-4 shadow-[0_6px_18px_rgba(20,36,74,0.18)]">
        {req ? (
          <>
            <p className="text-base font-bold text-navy">{req.message}</p>
            <p className="mt-0.5 text-xs text-gray-500">상대가 이름으로 찾아 명함 교환을 요청했습니다. 실제로 만났다면 확인을 눌러 주세요</p>
            <div className="mt-2">
              <CardView card={req.card} compact />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => confirm(true)} className="rounded-2xl bg-navy py-3 text-sm font-bold text-white">
                네, 교환했습니다
              </button>
              <button type="button" disabled={busy} onClick={() => confirm(false)} className="rounded-2xl border border-line py-3 text-sm">
                아니요
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </>
        ) : (
          first && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-base font-bold text-navy">{first.message}</p>
                <button type="button" onClick={() => dismiss(false)} className="text-sm text-gray-400">
                  닫기
                </button>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">상대가 내 QR을 찍어 서로 명함을 주고받았습니다. 교환한 명함 목록에 들어가 있습니다</p>
              <div className="mt-2">
                <CardView card={first.card} compact />
              </div>
              {first.ask_first_meet && (
                <div className="mt-2">
                  <FirstMeetAsk key={first.card.id} targetId={first.card.id} onDone={() => setTimeout(() => dismiss(false), 800)} />
                </div>
              )}
              {inbox.new.length > 1 && (
                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span>{inbox.new.length - 1}건 더 있습니다</span>
                  <button type="button" onClick={() => dismiss(true)} className="underline">
                    모두 확인
                  </button>
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
