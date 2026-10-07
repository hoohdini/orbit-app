"use client";
// 배정 버전 목록 · 확인 · 공개. 계산 버튼이 끝나면(orbit:versions-changed) 목록을 다시 읽는다.
// 공개 전에 "배정 보기"로 테이블별 구성원과 사람별 이유를 확인한다(9/27 회의: 운영진 더블체크).
// v0.2 A-03: 지표(그룹 수 · 크기, 평균 · 최저 점수, 검수 표시, 재회 쌍, 기수 초과, 미체크인), A-04: 두 사람을 골라 자리를 바꾼 새 초안, A-10: 인쇄 좌석표.
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
type Metrics = {
  groups: number;
  size_min: number;
  size_max: number;
  mean_score: number | null;
  low_score: number | null;
  check_tables: number[];
  reunion_pairs: number | null;
  cohort_over: number;
  not_checked_in: number;
};
type Detail = {
  version: number;
  round: string;
  status: string;
  metrics?: Metrics;
  tables: {
    table_no: number;
    mean_score?: number | null;
    check?: boolean;
    members: { id: string; display_name: string; affiliation: string | null; role: string; seat_no?: number | null; random: boolean; reason: string }[];
  }[];
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
  const [pick, setPick] = useState<string[]>([]);
  const [swapMsg, setSwapMsg] = useState<string | null>(null);

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
    setPick([]);
    setSwapMsg(null);
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

  // 수동 교체(A-04). 원본은 두고 두 사람 자리를 바꾼 새 초안을 만든다
  function toggle(id: string) {
    setPick((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.slice(-1), id]));
  }
  async function swap() {
    if (!open || pick.length !== 2) return;
    setBusy(open.version);
    const r = await api<{ version: number; delta: number }>("/api/ops/swap", { json: { version: open.version, a: pick[0], b: pick[1] } });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    setSwapMsg(`새 초안 ${r.data.version}번을 만들었다. 점수 변화 ${r.data.delta >= 0 ? "+" : ""}${r.data.delta}. 확인하고 공개한다`);
    setPick([]);
    window.dispatchEvent(new Event("orbit:versions-changed"));
  }

  // 공개 철회(비상용). 철회하면 그 라운드는 공개 버전이 없는 상태가 되어 참가자 화면에 배정이 안 보인다
  async function unpublish(v: Version) {
    const label = ROUND[v.round] ?? v.round;
    if (!window.confirm(`${label} 버전 ${v.version} 의 공개를 철회한다. 참가자 화면에서 배정이 사라진다. 계속할까?`)) return;
    setBusy(v.version);
    const r = await api<{ retired: number }>("/api/ops/unpublish", { json: { version: v.version } });
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
                  {v.status === "draft" && (
                    <button type="button" disabled={busy !== null} onClick={() => publish(v)} className="rounded-lg bg-black px-2 py-1 text-xs font-semibold text-white disabled:bg-gray-300">
                      공개
                    </button>
                  )}
                  {v.status === "published" && (
                    <button type="button" disabled={busy !== null} onClick={() => unpublish(v)} className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-40">
                      철회
                    </button>
                  )}
                </div>
              </div>
              {open?.version === v.version && (
                <div className="mt-2 space-y-2">
                  {open.metrics && (
                    <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                      <Metric label="그룹" value={`${open.metrics.groups}개 · ${open.metrics.size_min}~${open.metrics.size_max}명`} />
                      <Metric label="평균 · 최저 점수" value={`${open.metrics.mean_score ?? "-"} · ${open.metrics.low_score ?? "-"}`} />
                      <Metric label="재회 쌍 · 기수 초과" value={`${open.metrics.reunion_pairs ?? "-"} · ${open.metrics.cohort_over}`} warn={(open.metrics.reunion_pairs ?? 0) > 0 || open.metrics.cohort_over > 0} />
                      <Metric label="체크인 안 한 사람" value={`${open.metrics.not_checked_in}명`} />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <a href={`/api/ops/print?version=${open.version}`} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 px-2 py-1">
                      인쇄 좌석표
                    </a>
                    <span className="text-gray-500">{pick.length === 2 ? "두 사람을 골랐다" : "이름을 눌러 자리를 바꿀 두 사람을 고른다"}</span>
                    {pick.length === 2 && (
                      <button type="button" disabled={busy !== null} onClick={swap} className="rounded-lg bg-black px-2 py-1 font-semibold text-white">
                        자리 바꾼 새 초안 만들기
                      </button>
                    )}
                  </div>
                  {swapMsg && <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">{swapMsg}</p>}
                  {open.tables.map((t) => (
                    <div key={t.table_no} className={`rounded-xl p-2 ${t.check ? "bg-yellow-50" : "bg-gray-50"}`}>
                      <p className="text-xs font-semibold">
                        {t.table_no}번 · {t.members.length}명{t.mean_score != null ? ` · 평균 ${t.mean_score}` : ""}
                        {t.check && <span className="ml-1 rounded bg-yellow-200 px-1 text-[10px] text-yellow-900">검수</span>}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {t.members.map((m) => (
                          <li key={m.id} className="text-xs">
                            {m.seat_no != null && <span className="mr-1 text-gray-400">{m.seat_no}</span>}
                            <button type="button" onClick={() => toggle(m.id)} className={`font-medium ${pick.includes(m.id) ? "rounded bg-black px-1 text-white" : "underline decoration-dotted"}`}>
                              {m.display_name}
                            </button>
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

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border bg-white px-2 py-1.5 ${warn ? "border-yellow-300" : "border-gray-200"}`}>
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
