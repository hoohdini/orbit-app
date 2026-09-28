"use client";
// 배정 버전 목록 · 확인 · 공개. 계산 버튼이 끝나면(orbit:versions-changed) 목록을 다시 읽는다.
// 공개 전에 "배정 보기"로 테이블별 구성원과 사람별 이유를 확인한다(9/27 회의: 운영진 더블체크).
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Version = {
  version: number;
  round: string;
  status: string;
  created_at: string;
  published_at: string | null;
  summary: Record<string, unknown>;
};
type Detail = {
  version: number;
  round: string;
  tables: { table_no: number; members: { id: string; display_name: string; affiliation: string | null; role: string; random: boolean; reason: string }[] }[];
};

const ROUND = { tabletalk: "테이블토크", coffeechat: "커피챗" } as Record<string, string>;
const STATUS = { draft: "초안", published: "공개 중", retired: "지난 공개" } as Record<string, string>;
const STATUS_CLS = { draft: "bg-yellow-100 text-yellow-800", published: "bg-green-100 text-green-800", retired: "bg-gray-100 text-gray-500" } as Record<string, string>;

function time(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function VersionsPanel() {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ versions: Version[] }>("/api/ops/versions").then((r) => {
        if (!alive) return;
        if (r.ok) setVersions(r.data.versions);
        else setError(r.message);
      });
    load();
    window.addEventListener("orbit:versions-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("orbit:versions-changed", load);
    };
  }, []);

  async function show(version: number) {
    if (open?.version === version) return setOpen(null);
    setBusy(version);
    const r = await api<Detail>(`/api/ops/versions/${version}`);
    setBusy(null);
    if (r.ok) setOpen(r.data);
    else setError(r.message);
  }

  async function publish(v: Version) {
    const label = ROUND[v.round] ?? v.round;
    if (!window.confirm(`${label} 버전 ${v.version} 을 공개한다. 참가자 화면이 바로 이 배정으로 바뀐다. 계속할까?`)) return;
    setBusy(v.version);
    const r = await api<{ published_at: string }>("/api/ops/publish", { json: { version: v.version } });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    window.dispatchEvent(new Event("orbit:versions-changed"));
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold">배정 버전</h2>
      <p className="mt-0.5 text-xs text-gray-500">계산 결과는 초안이다. 배정을 확인하고 공개해야 참가자에게 보인다</p>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!versions ? (
        <p className="mt-2 text-sm text-gray-500">불러오는 중</p>
      ) : versions.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">아직 없다</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {versions.map((v) => (
            <li key={v.version} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">
                    {ROUND[v.round] ?? v.round} {v.version}
                  </span>
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${STATUS_CLS[v.status] ?? ""}`}>{STATUS[v.status] ?? v.status}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {time(v.created_at)}
                    {v.summary.n != null ? ` · ${v.summary.n}명` : ""}
                    {v.summary.fallback ? " · 만남 반영 끔" : ""}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button type="button" disabled={busy !== null} onClick={() => show(v.version)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
                    {open?.version === v.version ? "닫기" : "배정 보기"}
                  </button>
                  {v.status !== "published" && (
                    <button type="button" disabled={busy !== null} onClick={() => publish(v)} className="rounded-lg bg-black px-2 py-1 text-xs font-semibold text-white disabled:bg-gray-300">
                      공개
                    </button>
                  )}
                </div>
              </div>
              {open?.version === v.version && (
                <div className="mt-2 space-y-2">
                  {open.tables.map((t) => (
                    <div key={t.table_no} className="rounded-xl bg-gray-50 p-2">
                      <p className="text-xs font-semibold">{t.table_no}번 테이블 · {t.members.length}명</p>
                      <ul className="mt-1 space-y-1">
                        {t.members.map((m) => (
                          <li key={m.id} className="text-xs">
                            <span className="font-medium">{m.display_name}</span>
                            {m.affiliation && <span className="ml-1 text-gray-500">{m.affiliation}</span>}
                            {m.random && <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-800">무작위</span>}
                            {m.reason && <p className="text-gray-600">{m.reason}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
