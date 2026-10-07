"use client";
// 식순 진행 · 단계 전환(개발 지시서 v0.2 A-02)과 공지 송출(A-06). 참가자 화면은 15초 안에 따라온다.
// 단계를 마무리(wrapup)로 처음 넘기면 미션이 마감된다. 실수로 넘겼으면 앞 단계로 돌리며 미션 마감 풀기를 누른다.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PHASES, NOTICE_PRESETS } from "@/lib/phase";

type Status = { phase: string | null; phase_at?: string | null };

function hm(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PhasePanel() {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState(5);

  const load = useCallback(() => api<Status>("/api/ops/status").then((r) => r.ok && setSt(r.data)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function go(phase: string, reopen = false) {
    const label = PHASES.find((p) => p.key === phase)?.label ?? phase;
    if (!window.confirm(`단계를 ${label}(으)로 바꾼다. 참가자 화면이 15초 안에 바뀐다. 계속할까?`)) return;
    setBusy(true);
    const r = await api<{ phase_label: string; mission_closed_at: string | null }>("/api/ops/phase", { json: { phase, reopen_missions: reopen } });
    setBusy(false);
    if (!r.ok) return setMsg(r.message);
    setMsg(`${r.data.phase_label}(으)로 바꿨다${r.data.mission_closed_at ? ` · 미션 마감 ${hm(r.data.mission_closed_at)}` : ""}`);
    load();
  }

  async function notice(body: Record<string, unknown>) {
    setBusy(true);
    const r = await api<{ notice: { text: string; expires_at: string } | null }>("/api/ops/notice", { json: { minutes, ...body } });
    setBusy(false);
    if (!r.ok) return setMsg(r.message);
    setMsg(r.data.notice ? `공지 송출: ${r.data.notice.text} (${hm(r.data.notice.expires_at)}까지)` : "공지를 내렸다");
    if (body.text) setText("");
  }

  const idx = PHASES.findIndex((p) => p.key === st?.phase);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">식순 진행</h2>
        <span className="text-xs text-gray-500">{st?.phase ? `지금 ${PHASES[idx]?.label ?? st.phase}${st.phase_at ? ` · ${hm(st.phase_at)}부터` : ""}` : "단계 없음"}</span>
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-9">
        {PHASES.map((p, i) => (
          <li key={p.key}>
            <button
              type="button"
              disabled={busy || p.key === st?.phase}
              onClick={() => go(p.key)}
              className={`w-full rounded-lg px-2 py-2 text-xs ${p.key === st?.phase ? "bg-black font-semibold text-white" : i === idx + 1 ? "border-2 border-black" : "border border-gray-300"}`}
            >
              {p.label}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" disabled={busy || !st?.phase} onClick={() => st?.phase && go(st.phase === "wrapup" || st.phase === "award" ? "coffeechat_free" : st.phase, true)} className="mt-2 text-xs text-gray-500 underline">
        미션 마감 풀기(실수로 마무리로 넘겼을 때)
      </button>

      <h3 className="mt-5 text-sm font-semibold">공지</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {NOTICE_PRESETS.map((n) => (
          <button key={n.key} type="button" disabled={busy} onClick={() => notice({ preset: n.key })} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs" title={n.text}>
            {n.key === "start" ? "시작 안내" : n.key === "move" ? "이동 안내" : "마감 5분 전"}
          </button>
        ))}
        <label className="text-xs text-gray-500">
          <input type="number" min={1} max={60} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 5)} className="mr-1 w-12 rounded border border-gray-300 px-1 py-1" />
          분 동안
        </label>
        <button type="button" disabled={busy} onClick={() => notice({ clear: true })} className="text-xs text-gray-500 underline">
          공지 내리기
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="자유 입력(80자)" className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        <button type="button" disabled={busy || !text.trim()} onClick={() => notice({ text: text.trim() })} className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:bg-gray-300">
          송출
        </button>
      </div>
      {msg && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">{msg}</p>}
    </section>
  );
}
