"use client";
// 라운드 만족도 전면 카드(개발 지시서 v0.2 N-03). 단계가 tabletalk_end(테이블토크 뒤) · wrapup(커피챗 뒤)로 바뀌면 어느 탭에 있든 한 번 뜬다.
// "배정은 어땠나요?" 따봉 3단계(10/9 민찬) + 선택 질문 '이런 분을 더 만나 보고 싶다' 싶었던 분 고르기(여러 명, 안 골라도 됨, 고른 분에게 알리지 않음).
// 고를 수 있는 사람은 GET /api/tabletalk/satisfaction 의 candidates(같은 테이블 · 그룹에서 나 · 동의 거부자 뺌). 없으면 고르기 칸을 숨긴다.
// 답을 고른 뒤 보내기를 누른다. 질문이 뜬 뒤 보내기까지 걸린 시간(elapsed_ms)을 같이 보낸다(계산 서비스가 2초 미만 답을 거른다).
// 건너뛰기 가능. 이미 답했거나 이 기기에서 건너뛰었으면 다시 띄우지 않는다. 동의하지 않은 사람에게는 띄우지 않는다.
// 응답 여부는 미션 조건이 아니다. 선택지 정본은 app/api/tabletalk/_choices.ts.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { SATISFACTION_CHOICES, type SatisfactionChoice } from "@/app/api/tabletalk/_choices";
import { useOrbitState } from "./useOrbitState";

type Round = "tabletalk" | "coffeechat";
type Mate = { id: string; display_name: string };

const ROUND_OF: Record<string, Round> = { tabletalk_end: "tabletalk", wrapup: "coffeechat" };
const TITLE = { tabletalk: "이번 테이블 배정은 어땠나요?", coffeechat: "이번 커피챗 그룹 배정은 어땠나요?" };
const ICON: Record<string, string> = { gained: "👍👍", different: "👍", mismatch: "👎" };
const PICK_Q = "'이런 분을 더 만나 보고 싶다' 싶었던 분이 있나요?";
const PICK_NOTE = "고른 분과 비슷한 분을 커피챗 · 추천에 더 넣어 드려요. 고른 분에게는 알리지 않아요. 안 골라도 돼요";
const skipKey = (round: string) => `orbit:satisfaction-skip:${round}`;

export default function SatisfactionGate() {
  const s = useOrbitState();
  const round = s?.consent === "agreed" && s.phase ? ROUND_OF[s.phase] : undefined;
  const [open, setOpen] = useState<Round | null>(null);
  const [choice, setChoice] = useState<SatisfactionChoice | null>(null);
  const [mates, setMates] = useState<Mate[]>([]);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(0);
  const elapsed = useRef<number | null>(null);

  useEffect(() => {
    if (!round) return;
    try {
      if (sessionStorage.getItem(skipKey(round))) return;
    } catch {}
    let alive = true;
    api<{ answered: boolean; candidates?: Mate[] }>(`/api/tabletalk/satisfaction?round=${round}`).then((r) => {
      if (!alive || !r.ok || r.data.answered) return;
      setChoice(null);
      setPicks(new Set());
      setMates(r.data.candidates ?? []);
      elapsed.current = null;
      shownAt.current = performance.now(); // 클릭 이벤트의 timeStamp 와 같은 기준 시계
      setOpen(round);
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

  function pickChoice(c: SatisfactionChoice) {
    setChoice(c);
  }

  function togglePick(id: string) {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send(at: number) {
    if (!choice) return;
    elapsed.current = Math.max(0, Math.round(at - shownAt.current)); // 질문이 뜬 뒤 보내기까지(실수로 골라 놓고 고민하는 시간 포함)
    setBusy(true);
    setError(null);
    const r = await api("/api/tabletalk/satisfaction", {
      json: { choice, round: open, picks: [...picks], ...(elapsed.current !== null ? { elapsed_ms: elapsed.current } : {}) },
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center" role="dialog" aria-modal="true">
      <div className="mx-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 text-gray-900 sm:rounded-3xl">
        <h2 className="text-lg font-bold">{TITLE[open]}</h2>
        <p className="mt-1 text-xs text-gray-500">낮은 응답은 상대에게 어떤 형태로도 전달되지 않습니다</p>
        <div className="mt-4 grid gap-2">
          {SATISFACTION_CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              disabled={busy}
              onClick={() => pickChoice(c.key)}
              aria-pressed={choice === c.key}
              className={`rounded-xl border px-4 py-3 text-left text-sm ${choice === c.key ? "border-black bg-black text-white" : "border-gray-300"}`}
            >
              <span className="mr-2">{ICON[c.key] ?? ""}</span>
              {c.label}
            </button>
          ))}
        </div>
        {mates.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-semibold">{PICK_Q}</p>
            <p className="mt-1 text-xs text-gray-500">{PICK_NOTE}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {mates.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={busy}
                  onClick={() => togglePick(m.id)}
                  aria-pressed={picks.has(m.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${picks.has(m.id) ? "border-black bg-black text-white" : "border-gray-300"}`}
                >
                  {m.display_name}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button
          type="button"
          disabled={!choice || busy}
          onClick={(e) => send(e.timeStamp)}
          className="mt-5 w-full rounded-xl bg-black py-3 text-sm font-semibold text-white disabled:bg-gray-300"
        >
          {busy ? "보내는 중" : "보내기"}
        </button>
        <button type="button" onClick={close} className="mt-2 w-full py-2 text-sm text-gray-500">
          건너뛰기
        </button>
      </div>
    </div>
  );
}
