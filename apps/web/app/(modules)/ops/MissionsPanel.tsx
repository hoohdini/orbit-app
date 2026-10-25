"use client";
// 이벤트 · 미션 · 시상 현황(개발 지시서 v0.2 A-07)과 특별 시상 제외 명단(E-06).
// 미션 4종 · 스탬프 5칸. 시상은 스탬프 수 → 추천 인물과의 교환 수(최대 5) → 유효 포스터 응답 수 순, 셋이 같으면 공동 순위(10/23 민찬 결정, 표 칸도 이 순서). 응모권 추첨은 명찰 번호로 앱 밖에서 한다.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Data = {
  window: string;
  closed_at: string | null;
  checked_in: number;
  stamp_total: number;
  avg_stamps: number | null;
  avg_progress: number | null;
  completed_all: number;
  by_mission: { key: string; label: string; done: number }[];
  excluded: number;
  candidates: { place: number; tied: boolean; id: string; display_name: string; affiliation: string | null; progress: number; done_count: number; recommended_exchanges: number; valid_poster_responses: number }[];
  qr: { card_scans: number; poster_scans: number; tab_mismatch: number };
};

export default function MissionsPanel() {
  const [d, setD] = useState<Data | null>(null);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => api<Data>("/api/ops/missions").then((r) => (r.ok ? setD(r.data) : setMsg(r.message))), []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function upload() {
    const r = await api<{ people: unknown[]; unmatched: string[] }>("/api/ops/award-exclude", { json: { csv } });
    if (!r.ok) return setMsg(r.message);
    setMsg(`제외 명단 ${r.data.people.length}명 저장${r.data.unmatched.length ? ` · 못 찾은 줄: ${r.data.unmatched.join(" / ")}` : ""}`);
    setCsv("");
    load();
  }

  if (!d) return <p className="text-sm text-gray-500">{msg ?? "불러오는 중"}</p>;
  const all = `${d.stamp_total}/${d.stamp_total}`; // 스탬프 칸 수(lib/missions.ts STAMP_TOTAL)를 따라간다

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <Box label="평균 스탬프" value={d.avg_stamps == null ? "-" : `${d.avg_stamps} / ${d.stamp_total}`} />
        <Box label={`스탬프 ${all}`} value={`${d.completed_all} / ${d.checked_in}명`} />
        <Box label="QR 처리" value={`명함 ${d.qr.card_scans} · 포스터 ${d.qr.poster_scans}`} />
        <Box label="탭 불일치" value={String(d.qr.tab_mismatch)} />
      </div>
      <p className="text-xs text-gray-500">
        미션별 완료: {d.by_mission.map((m) => `${m.label} ${m.done}명`).join(" · ")} · {d.window === "closed" ? "마감됨" : d.window === "open" ? "진행 중" : "시작 전"}
      </p>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-sm font-semibold">특별 시상 후보(5명) <span className="font-normal text-gray-500">(제외 {d.excluded}명)</span></p>
        <p className="mt-0.5 text-xs text-gray-500">순위: 스탬프 많은 순 → 추천 인물 교환(최대 5명) 많은 순 → 포스터 유효 응답(5초 이상) 많은 순 → 셋이 같으면 공동 순위. 시각은 보지 않는다</p>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1">순위</th>
              <th>이름</th>
              <th>스탬프</th>
              <th>추천 인물 교환(최대 5)</th>
              <th>포스터</th>
            </tr>
          </thead>
          <tbody>
            {d.candidates.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="py-1">{c.tied ? `공동 ${c.place}위` : `${c.place}위`}</td>
                <td>
                  {c.display_name} <span className="text-gray-400">{c.affiliation ?? ""}</span>
                </td>
                <td>
                  {c.done_count}/{d.stamp_total}
                </td>
                <td>{c.recommended_exchanges}</td>
                <td>{c.valid_poster_responses}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.candidates.length === 0 && <p className="mt-2 text-xs text-gray-400">아직 없다</p>}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-sm font-semibold">시상 제외 명단(현장 운영진, 모델링팀)</p>
        <p className="mt-0.5 text-xs text-gray-500">한 줄에 이름,소속. 소속은 동명이인이 있을 때만. 올리면 명단을 통째로 바꾼다. 포스터 발표자는 제외하지 않는다</p>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-1 font-mono text-xs" placeholder={"이름,소속\n박성하,DSL 운영진"} />
        <button type="button" disabled={!csv.trim()} onClick={upload} className="mt-1 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:bg-gray-300">
          명단 올리기
        </button>
      </div>
      {msg && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">{msg}</p>}
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 font-bold">{value}</p>
    </div>
  );
}
