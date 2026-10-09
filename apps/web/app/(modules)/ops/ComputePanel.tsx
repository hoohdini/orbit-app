"use client";
// 계산 서비스 버튼 네 개. 누르기 전에 한 번 더 묻고, 끝나면 만든 초안 버전과 요약을 보여 준다.
// 결과는 초안이라 참가자에게는 아직 안 보인다. 공개는 아래 배정 버전(VersionsPanel)에서 한다.
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Job = "precompute" | "checkin" | "coffeechat" | "final";
type Health = { reachable: boolean; model_loaded?: boolean; version?: string };
type Done = { job: Job; ms: number; result: Record<string, unknown> };

const JOBS: { job: Job; label: string; when: string; what: string }[] = [
  { job: "precompute", label: "전날 계산", when: "행사 전날, 설문 마감 뒤 한 번", what: "새 코드북을 만들고 전원에게 주소를 준 뒤 테이블토크 자리를 배정한다. 다시 누르면 주소가 바뀐다" },
  { job: "checkin", label: "체크인 마감 계산", when: "체크인 마감 직후", what: "현장 등록자에게만 주소를 붙인다. 테이블토크는 전날 확정이라 다시 배정하지 않는다(새 초안 없음). 현장 등록자 자리는 체크인 칸의 워크인 추가에서 정한다" },
  { job: "coffeechat", label: "커피챗 계산", when: "포스터 응답 마감(16:45) 뒤", what: "만난 사람 · 만족도 · 포스터 응답을 반영해 커피챗 3~4명 그룹과 자유 이동 추천을 만든다. 다시 누르면 새 초안이 생긴다" },
  { job: "final", label: "행사 직후 추천", when: "시상 · 폐회 뒤", what: "커피챗 그룹은 그대로 두고 그날 신호로 추천 목록만 다시 만든다. 오늘 동석했거나 명함을 교환한 사람은 빠진다. 공개하면 참가자 화면에 '새 테이블' 카드가 다시 뜨므로(조 번호는 같음) 공개 전에 단톡방에 알린다" },
];

const SUMMARY: [string, string][] = [
  ["version", "초안 버전"],
  ["n", "배정 인원"],
  ["tables", "테이블 수"],
  ["issued", "주소 발급"],
  ["response_rate", "만족도 응답률"],
  ["fallback", "만남 반영 끔(응답률 부족)"],
  ["forbid_hits", "이미 만난 사람끼리 같은 테이블"],
  ["late", "커피챗 뒤에 와서 추천만 받은 사람"],
];

export default function ComputePanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const [running, setRunning] = useState<Job | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Health>("/api/ops/compute").then((r) => (r.ok ? setHealth(r.data) : setHealthErr(r.message)));
  }, []);

  async function run(job: Job, label: string) {
    if (!window.confirm(`${label}을 돌린다. 결과는 초안으로 저장되고 참가자에게는 아직 안 보인다. 계속할까?`)) return;
    setRunning(job);
    setError(null);
    setDone(null);
    const r = await api<Done>("/api/ops/compute", { json: { job } });
    setRunning(null);
    window.dispatchEvent(new Event("orbit:versions-changed")); // 배정 버전 목록을 다시 읽게 한다(실패해도 초안이 생겼을 수 있음)
    if (r.ok) setDone(r.data);
    else setError(r.message);
  }

  return (
    <>
      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold">계산 서비스</h2>
        <p className="mt-1 text-sm">
          {healthErr ? (
            <span className="text-red-600">{healthErr}</span>
          ) : !health ? (
            <span className="text-gray-500">확인 중</span>
          ) : health.reachable ? (
            <span className="text-green-700">연결됨{health.model_loaded ? " · 모델 올라가 있음" : " · 첫 계산 때 모델을 올린다(수십 초)"}</span>
          ) : (
            <span className="text-red-600">연결 안 됨. 서버가 켜져 있는지 확인한다</span>
          )}
        </p>
      </section>

      {JOBS.map((j) => (
        <section key={j.job} className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{j.label}</h2>
              <p className="mt-0.5 text-xs text-gray-500">{j.when}</p>
            </div>
            <button
              type="button"
              disabled={running !== null}
              onClick={() => run(j.job, j.label)}
              className="whitespace-nowrap rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-300"
            >
              {running === j.job ? "계산 중" : "돌리기"}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-600">{j.what}</p>
        </section>
      ))}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <h2 className="text-sm font-semibold">{JOBS.find((j) => j.job === done.job)?.label} 끝 · {(done.ms / 1000).toFixed(1)}초</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {SUMMARY.filter(([k]) => k in done.result && (k !== "late" || done.job === "final")).map(([k, name]) => (
              <div key={k} className="contents">
                <dt className="text-gray-600">{name}</dt>
                <dd>{String(done.result[k])}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-gray-600">초안이다. 아래 배정 버전에서 확인하고 공개해야 참가자에게 보인다</p>
        </section>
      )}
    </>
  );
}
