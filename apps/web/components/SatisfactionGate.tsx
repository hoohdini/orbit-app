"use client";
// 라운드 만족도 전면 카드(개발 지시서 v0.2 N-03). 단계가 tabletalk_end(테이블토크 뒤) · wrapup(커피챗 뒤)로 바뀌면 어느 탭에 있든 한 번 뜬다.
// 1문항 4지선다, 건너뛰기 가능. 이미 답했거나 이 기기에서 건너뛰었으면 다시 띄우지 않는다. 동의하지 않은 사람에게는 띄우지 않는다.
// 응답 여부는 미션 조건이 아니다. 선택지 정본은 app/api/tabletalk/_choices.ts.
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { SATISFACTION_CHOICES, type SatisfactionChoice } from "@/app/api/tabletalk/_choices";
import { useOrbitState } from "./useOrbitState";

const ROUND_OF: Record<string, "tabletalk" | "coffeechat"> = { tabletalk_end: "tabletalk", wrapup: "coffeechat" };
const TITLE = { tabletalk: "테이블토크는 어땠나요?", coffeechat: "커피챗은 어땠나요?" };
const skipKey = (round: string) => `orbit:satisfaction-skip:${round}`;

export default function SatisfactionGate() {
  const s = useOrbitState();
  const round = s?.consent === "agreed" && s.phase ? ROUND_OF[s.phase] : undefined;
  const [open, setOpen] = useState<"tabletalk" | "coffeechat" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!round) return;
    try {
      if (sessionStorage.getItem(skipKey(round))) return;
    } catch {}
    let alive = true;
    api<{ answered: boolean }>(`/api/tabletalk/satisfaction?round=${round}`).then((r) => {
      if (alive && r.ok && !r.data.answered) setOpen(round);
    });
    return () => {
      alive = false;
    };
  }, [round]);

  if (!open) return null;

  function close() {
    try {
      sessionStorage.setItem(skipKey(open!), "1");
    } catch {}
    setOpen(null);
  }

  async function choose(choice: SatisfactionChoice) {
    setBusy(true);
    setError(null);
    const r = await api("/api/tabletalk/satisfaction", { json: { choice, round: open } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center" role="dialog" aria-modal="true">
      <div className="mx-auto w-full max-w-md rounded-t-3xl bg-white p-5 text-gray-900 sm:rounded-3xl">
        <h2 className="text-lg font-bold">{TITLE[open]}</h2>
        <p className="mt-1 text-xs text-gray-500">낮은 응답은 상대에게 어떤 형태로도 전달되지 않습니다</p>
        <div className="mt-4 grid gap-2">
          {SATISFACTION_CHOICES.map((c) => (
            <button key={c.key} type="button" disabled={busy} onClick={() => choose(c.key)} className="rounded-xl border border-gray-300 px-4 py-3 text-left text-sm">
              {c.label}
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button type="button" onClick={close} className="mt-3 w-full py-2 text-sm text-gray-500">
          건너뛰기
        </button>
      </div>
    </div>
  );
}
