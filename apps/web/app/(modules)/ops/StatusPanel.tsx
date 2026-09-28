"use client";
// 상태판. 체크인 · 만족도 응답률 · 명함 교환 · 계산 서비스 생존 신호 · 라운드별 공개 버전. 15초마다 다시 읽는다.
// 아래에 계산 서비스를 노트북에서 직접 부르는 명령도 보여 준다(9/29 결정: 행사 당일 계산 서비스는 운영자 노트북).
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

const ROUND_LABEL = { tabletalk: "테이블토크", coffeechat: "커피챗" } as const;

function fmt(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function agoMin(iso: string | null | undefined, now: string): number | null {
  if (!iso) return null;
  return Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60000);
}

export default function StatusPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await api<Status>("/api/ops/status");
    if (!s.ok) return setError(s.message);
    setError(null);
    setStatus(s.data);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0); // effect 안에서 바로 setState 하지 않도록 한 틱 뒤에 읽는다
    const t = setInterval(load, POLL_MS);
    window.addEventListener("orbit:versions-changed", load); // 계산 · 공개 뒤 곧바로 갱신
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener("orbit:versions-changed", load);
    };
  }, [load]);

  if (error && !status) return <p className="rounded-lg bg-yellow-50 px-3 py-3 text-sm text-yellow-800">{error}</p>;
  if (!status) return <p className="text-sm text-gray-500">상태판 불러오는 중</p>;

  const hb = status.compute_heartbeat;
  const hbAgo = agoMin(hb?.at, status.now);
  const rate = status.satisfaction.rate;

  return (
    <>
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">상태판</h2>
          <span className="text-xs text-gray-500">
            행사 {status.event_id}
            {status.phase ? ` · 단계 ${status.phase}` : ""} · {fmt(status.now)} 기준, 15초마다 갱신
          </span>
        </div>
        {error && <p className="mt-2 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{error}</p>}
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
            label="계산 서비스 마지막 작업"
            value={hb ? `${hbAgo}분 전` : "기록 없음"}
            sub={hb ? `${hb.last} · ${fmt(hb.at)}` : "아직 한 번도 돌지 않았다"}
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
        <h2 className="text-base font-semibold">계산 서비스를 노트북에서 직접 부를 때</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          행사 당일 계산 서비스는 운영자 노트북에서 띄운다(services/compute, 포트 8000). 위 버튼은 서버의 COMPUTE_URL 이 그 노트북에 닿을 때만 동작하므로, 닿지 않으면 노트북 터미널에서 아래 명령을 순서대로 부른다.
          결과는 초안으로 저장되고 배정 버전 목록에 15초 안에 나타난다. 비밀키는 services/compute/.env 의 COMPUTE_SECRET 이다
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
    </>
  );
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
