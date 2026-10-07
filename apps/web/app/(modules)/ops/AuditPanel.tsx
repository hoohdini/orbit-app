"use client";
// 감사 로그(개발 지시서 v0.2 A-09). 단계 전환, 공지, 공개, 철회, 수동 교체, 계산, 체크인 등 운영 쓰기를 누가 언제 했는지 최신 순으로.
import { useState } from "react";
import { api } from "@/lib/client";

type Entry = { id: number; kind: string; actor: { id: string; display_name: string | null }; payload: Record<string, unknown>; at: string };

const KIND: Record<string, string> = {
  ops_phase: "단계 전환", ops_notice: "공지", ops_publish: "공개", ops_unpublish: "철회", ops_swap: "수동 교체", ops_compute: "계산",
  ops_checkin: "수동 체크인", ops_label: "이름표", ops_raffle: "추첨", ops_award_exclude: "시상 제외", walkin_added: "워크인", pin_reset: "숫자 재발급",
};

export default function AuditPanel() {
  const [list, setList] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await api<{ entries: Entry[] }>("/api/ops/audit?limit=50");
    if (r.ok) setList(r.data.entries);
    else setError(r.message);
  }

  return (
    <div>
      <button type="button" onClick={load} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs">
        {list ? "새로 읽기" : "감사 로그 열기"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {list && (
        <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white text-xs">
          {list.length === 0 && <li className="p-2 text-gray-400">기록이 없다</li>}
          {list.map((e) => (
            <li key={e.id} className="flex gap-2 p-2">
              <span className="w-24 shrink-0 text-gray-500">{new Date(e.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="w-20 shrink-0 font-medium">{KIND[e.kind] ?? e.kind}</span>
              <span className="w-16 shrink-0">{e.actor.display_name ?? "-"}</span>
              <span className="truncate text-gray-500">{JSON.stringify(e.payload)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
