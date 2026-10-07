"use client";
// 오늘 처음 대화한 분인가요? 와 한 줄 남기기(개발 지시서 v0.2 H-05, 미션 ③). 교환 결과 화면(찍은 쪽)과 받은 명함 알림(찍힌 쪽)에서 한 번만 묻는다.
// 예 · 아니요 · 건너뛰기 셋 다 서버에 남겨 다시 묻지 않는다(건너뛰기는 first_meet null).
import { useState } from "react";
import { api } from "@/lib/client";

export default function FirstMeetAsk({ targetId, onDone }: { targetId: string; onDone?: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<boolean | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  async function answer(firstMeet: boolean | null) {
    setBusy(true);
    setError(null);
    const r = await api("/api/card/first-meet", { json: { target_id: targetId, first_meet: firstMeet, ...(note.trim() ? { note: note.trim() } : {}) } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setDone(firstMeet);
    onDone?.();
  }

  if (done !== undefined) {
    return <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">{done ? "새로운 연결로 기록했다" : "기록했다"}</p>;
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-sm font-semibold">오늘 처음 대화한 분인가요?</p>
      <input
        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="한 줄 남기기(선택, 나만 본다)"
        maxLength={100}
      />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" disabled={busy} onClick={() => answer(true)} className="rounded-lg bg-black py-2 text-sm font-semibold text-white">
          네
        </button>
        <button type="button" disabled={busy} onClick={() => answer(false)} className="rounded-lg border border-gray-300 py-2 text-sm">
          아니요
        </button>
        <button type="button" disabled={busy} onClick={() => answer(null)} className="rounded-lg py-2 text-sm text-gray-500">
          건너뛰기
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
