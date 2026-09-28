"use client";
// 포스터세션 현황과 추첨. 포스터별 스탬프 · 관심도 답, 응모권 수, 추첨(응모권 1장 1표, 한 사람 한 번).
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Poster = { id: number; code: string; title: string; presenter: string | null; booth: string | null; stamps: number; interest: Record<string, number> };
type Raffle = { at: string; n: number; winners: { id: string; display_name: string; affiliation: string | null; tickets: number }[] };
type Data = { posters: Poster[]; stamps_total: number; people_with_stamps: number; tickets_total: number; people_with_tickets: number; raffle: Raffle | null };

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PosterPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState("3");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>("/api/ops/poster");
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.message);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  async function draw() {
    if (!armed) return setArmed(true);
    setBusy(true);
    setError(null);
    try {
      const r = await api<Raffle>("/api/ops/raffle", { json: { n: Number(n) || 1 } });
      if (!r.ok) return setError(r.message);
      await load();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  }

  if (!data) return error ? <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{error}</p> : <p className="text-sm text-gray-500">불러오는 중</p>;

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{error}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="스탬프" value={String(data.stamps_total)} sub={`${data.people_with_stamps}명이 받음`} />
        <Stat label="응모권" value={String(data.tickets_total)} sub={`${data.people_with_tickets}명이 가짐`} />
        <Stat label="포스터" value={String(data.posters.length)} sub="등록된 수" />
        <Stat label="마지막 추첨" value={data.raffle ? `${data.raffle.winners.length}명` : "-"} sub={data.raffle ? fmt(data.raffle.at) : "아직 안 했다"} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">코드</th>
              <th className="px-3 py-2">제목</th>
              <th className="px-3 py-2">부스</th>
              <th className="px-3 py-2 text-right">스탬프</th>
              <th className="px-3 py-2">관심도 (더 알아보고 싶다 · 흥미로웠다 · 아니다)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.posters.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-3 py-2">
                  {p.title}
                  {p.presenter && <span className="ml-1 text-xs text-gray-500">{p.presenter}</span>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">{p.booth ?? "-"}</td>
                <td className="px-3 py-2 text-right font-semibold">{p.stamps}</td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {p.interest.learn_more ?? 0} · {p.interest.interesting ?? 0} · {p.interest.not_mine ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">추첨</h3>
          <span className="text-xs text-gray-500">응모권 1장이 1표, 한 사람은 한 번만 뽑힌다. 다시 뽑으면 결과를 덮어쓴다</span>
          <input value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 2))} className="ml-auto w-14 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
          <span className="text-xs text-gray-500">명</span>
          <button
            type="button"
            disabled={busy || data.tickets_total === 0}
            onClick={draw}
            className={`rounded-lg px-3 py-1 text-xs font-semibold text-white disabled:bg-gray-300 ${armed ? "bg-red-600" : "bg-black"}`}
          >
            {armed ? "정말 뽑기 (다시 누름)" : "뽑기"}
          </button>
          {armed && (
            <button type="button" onClick={() => setArmed(false)} className="text-xs text-gray-500 underline">
              취소
            </button>
          )}
        </div>
        {data.raffle && (
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm">
            {data.raffle.winners.map((w) => (
              <li key={w.id}>
                <span className="font-medium">{w.display_name}</span>
                {w.affiliation && <span className="ml-1 text-gray-500">{w.affiliation}</span>}
                <span className="ml-1 text-xs text-gray-400">응모권 {w.tickets}장</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}
