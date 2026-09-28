// 운영 콘솔 1단계 (담당: 성하). 상태판 · 배정 버전 목록과 공개 · 계산 서비스 부르는 법.
// 계산 서비스는 운영자 노트북에서 직접 부른다(9/29 결정). 이 화면은 결과(초안)를 확인하고 공개하는 곳이다.
// 15초마다 다시 읽는다. 공개는 두 번 눌러야 한다(브라우저 확인창 대신).
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

const POLL_MS = 15_000;

type Status = {
  event_id: string;
  phase: string | null;
  participants: number;
  checkins: number;
  satisfaction: { answered: number; rate: number | null };
  exchanges: number;
  compute_heartbeat: { at: string; last: string } | null;
  published: Record<string, { version: number; published_at: string | null } | null>;
  now: string;
};
type Version = {
  version: number;
  round: "tabletalk" | "coffeechat";
  status: "draft" | "published" | "retired";
  params: Record<string, unknown>;
  created_at: string;
  published_at: string | null;
};

const ROUND_LABEL = { tabletalk: "테이블토크", coffeechat: "커피챗" } as const;
const STATUS_LABEL = { draft: "초안", published: "공개", retired: "철회" } as const;

function fmt(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function agoMin(iso: string | null | undefined, now: string): number | null {
  if (!iso) return null;
  return Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60000);
}

export default function OpsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState<number | null>(null); // 공개 버튼을 한 번 누른 버전
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, v] = await Promise.all([api<Status>("/api/ops/status"), api<{ versions: Version[] }>("/api/ops/versions")]);
    if (!s.ok) return setError(s.message);
    if (!v.ok) return setError(v.message);
    setError(null);
    setStatus(s.data);
    setVersions(v.data.versions);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0); // effect 안에서 바로 setState 하지 않도록 한 틱 뒤에 읽는다
    const t = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  async function publish(version: number) {
    if (armed !== version) {
      setArmed(version);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ published_at: string; round: string; retired: number[] }>("/api/ops/publish", { json: { version } });
      if (!r.ok) return setNotice(`공개 실패: ${r.message}`);
      setNotice(`${version}번을 공개했다${r.data.retired.length ? ` (이전 공개 ${r.data.retired.join(", ")}번은 철회)` : ""}`);
      await load();
    } finally {
      setBusy(false);
      setArmed(null);
    }
  }

  if (error && !status) return <p className="rounded-lg bg-yellow-50 px-3 py-3 text-sm text-yellow-800">{error}</p>;
  if (!status) return <p className="text-sm text-gray-500">불러오는 중</p>;

  const hb = status.compute_heartbeat;
  const hbAgo = agoMin(hb?.at, status.now);
  const rate = status.satisfaction.rate;

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{error}</p>}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">상태판</h2>
          <span className="text-xs text-gray-500">
            행사 {status.event_id}
            {status.phase ? ` · 단계 ${status.phase}` : ""} · {fmt(status.now)} 기준, 15초마다 갱신
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="체크인" value={`${status.checkins} / ${status.participants}`} sub="첫 로그인이 체크인" />
          <Stat
            label="만족도 응답"
            value={rate == null ? "-" : `${Math.round(rate * 100)}%`}
            sub={`${status.satisfaction.answered}명 · 50% 미만이면 커피챗은 대체 경로`}
            warn={rate != null && rate < 0.5}
          />
          <Stat label="명함 교환" value={String(status.exchanges)} sub="건수(양방향 1건)" />
          <Stat
            label="계산 서비스"
            value={hb ? `${hbAgo}분 전` : "신호 없음"}
            sub={hb ? `마지막 작업 ${hb.last} · ${fmt(hb.at)}` : "아직 한 번도 돌지 않았다"}
            warn={!hb}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(["tabletalk", "coffeechat"] as const).map((r) => {
            const p = status.published[r];
            return (
              <div key={r} className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">{ROUND_LABEL[r]} 공개 중</p>
                <p className="mt-0.5 text-lg font-semibold">{p ? `${p.version}번` : "없음"}</p>
                {p && <p className="text-xs text-gray-500">{fmt(p.published_at)} 공개</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold">배정 버전</h2>
        <p className="mt-0.5 text-xs text-gray-500">계산 서비스가 만든 초안을 확인하고 공개한다. 공개 버튼은 두 번 누른다. 같은 라운드의 이전 공개 버전은 자동으로 철회된다</p>
        {notice && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
        {versions.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">아직 배정 버전이 없다. 아래 명령으로 계산 서비스를 먼저 돌린다</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">버전</th>
                  <th className="px-3 py-2">라운드</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">만든 시각</th>
                  <th className="px-3 py-2">요약</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {versions.map((v) => (
                  <tr key={v.version} className={v.status === "retired" ? "text-gray-400" : ""}>
                    <td className="px-3 py-2 font-mono">{v.version}</td>
                    <td className="px-3 py-2">{ROUND_LABEL[v.round]}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${v.status === "published" ? "bg-green-100 text-green-800" : v.status === "draft" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-500"}`}
                      >
                        {STATUS_LABEL[v.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(v.created_at)}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{summary(v)}</td>
                    <td className="px-3 py-2 text-right">
                      {v.status === "draft" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => publish(v.version)}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold text-white disabled:bg-gray-300 ${armed === v.version ? "bg-red-600" : "bg-black"}`}
                        >
                          {armed === v.version ? "정말 공개 (다시 누름)" : "공개"}
                        </button>
                      )}
                      {armed === v.version && (
                        <button type="button" onClick={() => setArmed(null)} className="ml-2 text-xs text-gray-500 underline">
                          취소
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold">계산 서비스 부르는 법</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          계산 서비스는 운영자 노트북에서 띄운다(services/compute, 포트 8000). 노트북 터미널에서 아래 명령을 순서대로 부른다. 결과는 초안으로 저장되고 위 목록에 15초 안에 나타난다. 비밀키는 services/compute/.env 의 COMPUTE_SECRET 이다
        </p>
        <div className="mt-2 space-y-2">
          <Cmd
            title="1. 행사 전날 (사전 등록자 전원 주소 · 이름표 · 테이블토크 초안)"
            cmd={`curl -X POST http://localhost:8000/precompute -H "X-Compute-Secret: $COMPUTE_SECRET" -H "Content-Type: application/json" -d '{"event_id":"${status.event_id}"}'`}
          />
          <Cmd
            title="2. 체크인 마감 (저장된 코드북에 현장 등록자만 붙이고, 체크인한 사람으로 테이블토크를 다시 냄)"
            cmd={`curl -X POST http://localhost:8000/precompute -H "X-Compute-Secret: $COMPUTE_SECRET" -H "Content-Type: application/json" -d '{"event_id":"${status.event_id}","reuse_codebook":true}'`}
          />
          <Cmd
            title="3. 테이블토크 뒤, 포스터세션 끝 무렵 (명함 교환 · 만족도 · 포스터 관심도 반영해 커피챗 초안과 추천)"
            cmd={`curl -X POST http://localhost:8000/coffeechat -H "X-Compute-Secret: $COMPUTE_SECRET" -H "Content-Type: application/json" -d '{"event_id":"${status.event_id}"}'`}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">409 가 나오면 사람이 부족하거나(5명 미만) 코드북 · 테이블토크 배정이 아직 없는 것이다. 응답의 detail 을 읽는다</p>
      </section>
    </div>
  );
}

function summary(v: Version): string {
  const p = v.params;
  const parts: string[] = [];
  if (typeof p.n === "number") parts.push(`${p.n}명`);
  if (p.kind === "precompute") parts.push(p.reuse_codebook ? "체크인 마감 재배정" : "전날 배치");
  if (p.kind === "coffeechat") {
    if (typeof p.response_rate === "number") parts.push(`응답률 ${Math.round(p.response_rate * 100)}%`);
    if (p.fallback) parts.push("대체 경로(만남 반영 없음)");
    if (typeof p.edges === "number") parts.push(`교환 ${p.edges}건`);
    if (typeof p.poster_answers === "number") parts.push(`포스터 답 ${p.poster_answers}개`);
    if (p.sat_counts && typeof p.sat_counts === "object") {
      const c = p.sat_counts as Record<string, number>;
      parts.push(`만족도 얻음 ${c.gained ?? 0} · 달랐음 ${c.different ?? 0} · 모름 ${c.unsure ?? 0} · 안맞음 ${c.mismatch ?? 0}`);
    }
  }
  if (typeof p.table_mode === "string") parts.push(`결합 ${p.table_mode}`);
  return parts.join(" · ") || "-";
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-3 ${warn ? "border-yellow-300" : "border-gray-200"}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

function Cmd({ title, cmd }: { title: string; cmd: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium">{title}</p>
        <button type="button" onClick={copy} className="shrink-0 text-xs text-gray-500 underline">
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2 font-mono text-[11px] text-gray-800">{cmd}</pre>
    </div>
  );
}
