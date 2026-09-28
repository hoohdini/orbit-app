"use client";
// 이름표(라벨) 편집. 계산 서비스가 주소 첫자리 묶음마다 단 'A, B 계열' 초안을 운영진이 행사 전에 고친다.
// 참가자 화면(홈 · 명함 · 온보딩)에 숫자 대신 이 이름표가 보인다. 체크인 마감 계산을 다시 돌려도 고친 이름표는 덮어쓰지 않는다.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Label = { prefix: number[]; label: string; members: number };

export default function LabelsPanel() {
  const [version, setVersion] = useState<string | null | undefined>(undefined);
  const [labels, setLabels] = useState<Label[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ codebook_version: string | null; labels: Label[] }>("/api/ops/labels");
    if (!r.ok) return setError(r.message);
    setVersion(r.data.codebook_version);
    setLabels(r.data.labels);
    setDraft(Object.fromEntries(r.data.labels.map((l) => [l.prefix.join("-"), l.label])));
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    window.addEventListener("orbit:versions-changed", load); // 전날 계산이 새 코드북을 만들면 다시 읽는다
    return () => {
      clearTimeout(first);
      window.removeEventListener("orbit:versions-changed", load);
    };
  }, [load]);

  async function save(l: Label) {
    const key = l.prefix.join("-");
    const label = (draft[key] ?? "").trim();
    if (!label || label === l.label || !version) return;
    setBusy(key);
    setError(null);
    setSaved(null);
    try {
      const r = await api<{ saved: boolean }>("/api/ops/labels", { json: { codebook_version: version, prefix: l.prefix, label } });
      if (!r.ok) return setError(r.message);
      setSaved(key);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (version === undefined) return <p className="text-sm text-gray-500">불러오는 중</p>;
  if (version === null)
    return <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">아직 코드북이 없다. 전날 계산을 돌리면 이름표 초안이 생긴다</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">코드북 {version} · 묶음 {labels.length}개. 문구를 고치고 저장을 누른다. 참가자 화면에 바로 반영된다</p>
      {error && <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{error}</p>}
      <div className="rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">묶음</th>
              <th className="px-3 py-2">사람</th>
              <th className="px-3 py-2">이름표</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {labels.map((l) => {
              const key = l.prefix.join("-");
              const changed = (draft[key] ?? "").trim() !== l.label;
              return (
                <tr key={key}>
                  <td className="px-3 py-2 font-mono text-xs">{key}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{l.members}명</td>
                  <td className="px-3 py-2">
                    <input
                      value={draft[key] ?? ""}
                      maxLength={40}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && save(l)}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-black"
                    />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      disabled={!changed || busy !== null}
                      onClick={() => save(l)}
                      className="rounded-lg bg-black px-2 py-1 text-xs font-semibold text-white disabled:bg-gray-300"
                    >
                      {busy === key ? "저장 중" : saved === key && !changed ? "저장됨" : "저장"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
