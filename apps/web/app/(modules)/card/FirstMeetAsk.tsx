"use client";
// 오늘 처음 대화한 분인가요? 와 한 줄 남기기(개발 지시서 v0.2 H-05, 미션 ④ 새로운 연결). 교환 결과 화면(찍은 쪽)과 받은 명함 알림(찍힌 쪽)에서 한 번만 묻는다.
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
    return <p className="rounded-xl bg-strip/50 px-3 py-2 text-xs text-ink-2">{done ? "새로운 연결로 기록했어요" : "기록했어요"}</p>;
  }

  return (
    <section className="rounded-2xl bg-strip/50 p-4 text-left">
      <p className="text-sm font-bold text-navy">오늘 처음 대화한 분인가요?</p>
      <input
        className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-navy"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="메모 남기기(선택, 나만 봐요)"
        maxLength={200}
      />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" disabled={busy} onClick={() => answer(true)} className="rounded-xl bg-navy py-2 text-sm font-bold text-white">
          네
        </button>
        <button type="button" disabled={busy} onClick={() => answer(false)} className="rounded-xl border border-line bg-white py-2 text-sm">
          아니요
        </button>
        <button type="button" disabled={busy} onClick={() => answer(null)} className="rounded-xl py-2 text-sm text-ink-3">
          건너뛰기
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
