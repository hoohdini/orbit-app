"use client";
// 네트워킹 탭 화면(개발 지시서 v0.2 N-01 ~ N-06). 궤도는 위, 명단은 아래. 자유 이동용 추천은 넣지 않는다(명함 탭 H-04).
// 어느 배정을 보여 줄지는 상태 API 로 정한다:
// - 커피챗 배정이 공개됐고 단계가 포스터 세션 이후이면 "새 테이블이 배정됐어요" 카드를 먼저 띄운다(N-06). 확인 전에는 테이블토크 화면 그대로
//   (단계도 함께 본다. 예전 공개본이 남아 있어도 테이블토크 단계에서는 커피챗을 꺼내지 않는다)
// - 확인했거나 단계가 커피챗(coffeechat_seated 부터)이면 커피챗 화면(N-04 · N-05). 테이블토크 화면도 위 전환 버튼으로 다시 볼 수 있다
// 마지막으로 받은 배정은 기기에 저장해 통신이 끊겨도 보여 준다(N-02). 대화거리 · 상대 현재 위치는 보여 주지 않는다(결정 2).
// 모양은 피그마 네트워킹(10/11): 나의 궤도 → MY TABLE · GROUP → 좌석 순서 목록. 배정 대기 · 배정 완료는 가운데 카드로 덮는다
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import { useOrbitState, refreshOrbitState } from "@/components/useOrbitState";
import Orbit from "./Orbit";

type Member = { id: string; display_name: string; affiliation: string | null; role: string; cohort: number | null; seat_no?: number | null; career_line: string; offer_text: string; seek_text?: string; reason?: string | null };
type Assignment = { no: number; members: Member[] };
type OrbitData = {
  me: { table_no: number; grid: { row: number; col: number } | null };
  inner: { id: string; display_name: string }[];
  outer: { table_no: number; label: string | null; grid: { row: number; col: number } | null }[];
};
type Round = "tabletalk" | "coffeechat";
type View = { assignment: Assignment; orbit: OrbitData | null; offline: boolean };

// 커피챗 배정을 꺼내도 되는 단계(포스터 세션 16:55 공개 이후). 단계가 아직 없으면(운영 전) 공개 여부만 본다
const CC_READY = ["poster", "coffeechat_seated", "coffeechat_free", "wrapup", "award"];
const CC_NOW = ["coffeechat_seated", "coffeechat_free", "wrapup", "award"];
const cacheKey = (round: Round) => `orbit:networking:${round}`;
const ackKey = (version: number) => `orbit:coffeechat-ack:${version}`;

function readLocal<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeLocal(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

async function loadRound(round: Round): Promise<View | "unpublished"> {
  const path = round === "tabletalk" ? "/api/tabletalk/table" : "/api/coffeechat/table";
  const [t, o] = await Promise.all([
    api<{ table_no?: number; group_no?: number; members: Member[] }>(path),
    api<OrbitData>(`/api/tabletalk/orbit?round=${round}`),
  ]);
  if (!t.ok) {
    if (t.code === "NOT_PUBLISHED") return "unpublished";
    const cached = readLocal<{ assignment: Assignment; orbit: OrbitData | null }>(cacheKey(round));
    if (cached) return { ...cached, offline: true };
    return "unpublished";
  }
  const assignment = { no: (t.data.group_no ?? t.data.table_no)!, members: t.data.members };
  const orbit = o.ok ? o.data : null;
  writeLocal(cacheKey(round), { assignment, orbit });
  return { assignment, orbit, offline: false };
}

export default function NetworkingClient() {
  const s = useOrbitState();
  const [meId, setMeId] = useState<string | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [view, setView] = useState<View | "unpublished" | null>(null);
  const [ackTick, setAckTick] = useState(0);

  const phaseOk = !s?.phase || CC_READY.includes(s.phase);
  const ccVersion = s?.coffeechat && phaseOk ? s.published.coffeechat : null;
  const acked = ccVersion !== null && (ackTick >= 0 && readLocal<boolean>(ackKey(ccVersion)) === true);
  const pending = ccVersion !== null && !acked; // 새 배정 안내 카드를 띄울 때
  const ccNow = !!s?.phase && CC_NOW.includes(s.phase);
  // 내가 고른 화면이 있으면 그것, 아니면 확인했거나 커피챗 단계면 커피챗(확인 카드는 위에 계속 둔다)
  const shown: Round = ccVersion === null ? "tabletalk" : (round ?? (acked || ccNow ? "coffeechat" : "tabletalk"));

  useEffect(() => {
    api<{ participant: { id: string; display_name: string } }>("/api/onboarding/me").then((r) => {
      if (r.ok) {
        setMeId(r.data.participant.id);
      }
    });
  }, []);

  const pubKey = `${s?.published.tabletalk ?? "-"}:${s?.published.coffeechat ?? "-"}`;
  useEffect(() => {
    let alive = true;
    loadRound(shown).then((v) => alive && setView(v));
    return () => {
      alive = false;
    };
  }, [shown, pubKey]);

  function confirmNew() {
    if (ccVersion === null) return;
    writeLocal(ackKey(ccVersion), true);
    setRound(null);
    setAckTick((n) => n + 1);
    refreshOrbitState();
  }

  if (!s || view === null) return <Loading />;

  const canSwitch = ccVersion !== null && (acked || ccNow) && !!s.tabletalk;
  const isTT = shown === "tabletalk";
  // 커피챗 첫 배치 단계인데 아직 공개 전이면 배정 대기 카드(피그마 배정 전환 안내 - 푸쉬 전). 공개되면 상태 API 가 15초 안에 바꾼다
  const waiting = s.phase === "coffeechat_seated" && s.published.coffeechat === null;

  return (
    <main className="space-y-6 px-5 py-6">
      {view === "unpublished" ? (
        <p className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-ink-2">
          {isTT ? "테이블 배정이 곧 공개됩니다" : "커피챗 배정은 포스터 세션 뒤에 공개됩니다"}
        </p>
      ) : (
        <>
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-navy">나의 궤도</h2>
              {canSwitch ? (
                <button type="button" onClick={() => setRound(isTT ? "coffeechat" : "tabletalk")} className="h-9 rounded-full border border-navy bg-[#eef1f7] px-3 text-xs font-medium text-brand" aria-label="테이블토크 · 커피챗 바꿔 보기">
                  {isTT ? "테이블토크" : "커피챗"} ⇄
                </button>
              ) : (
                <span className="flex h-6 items-center rounded-full bg-[#eef1f7] px-2 text-xs font-medium text-brand">{isTT ? "테이블토크" : "커피챗"}</span>
              )}
            </div>
            {view.orbit ? (
              <Orbit people={view.orbit.inner} others={view.orbit.outer} round={shown} />
            ) : (
              <p className="rounded-3xl border border-line p-6 text-center text-xs text-ink-3">궤도를 불러오지 못했어요</p>
            )}
            <p className="text-xs text-ink-2">가까울수록 나와 잘 맞는 {isTT ? "구성원" : "그룹원"}입니다.</p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between rounded-3xl border border-navy bg-strip px-6 py-[18px]">
              <div>
                <p className="text-xs font-medium text-accent">{isTT ? "MY TABLE" : "MY GROUP"}</p>
                <p className="text-[72px] font-bold leading-[80px] text-navy">{view.assignment.no}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-navy">{isTT ? `${view.assignment.no}번 테이블` : `커피챗 ${view.assignment.no}그룹`}</p>
                <p className="mt-1 text-[13px] text-ink-2">
                  {view.assignment.members.length}명 · {isTT ? "좌석 순서대로" : "첫 10분 대화 후 자유 이동"}
                </p>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-ink-2">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              {view.offline ? "연결이 끊겨 기기에 저장된 배정을 보여 주고 있어요." : "배정 결과가 기기에 저장되어 통신이 끊겨도 볼 수 있습니다."}
            </p>

            <ol className="overflow-hidden rounded-3xl border border-navy bg-white py-1">
              {view.assignment.members.map((m, i) => {
                const me = m.id === meId;
                const no = isTT ? (m.seat_no ?? i + 1) : null;
                const sub = [m.affiliation, m.career_line].filter(Boolean).join(" · ");
                const accent = isTT ? (m.offer_text ? `Offer · ${m.offer_text}` : "") : m.reason ? m.reason : m.seek_text ? `Seek: "${m.seek_text}"` : "";
                return (
                  <li key={m.id} className={`flex items-start gap-[14px] px-5 py-[14px] ${i < view.assignment.members.length - 1 ? "border-b border-navy" : ""} ${me ? "bg-[#f0f3fa]" : ""}`}>
                    {no !== null && (
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-2xl text-xs font-medium ${me ? "bg-brand text-white" : "bg-strip text-navy"}`}>{String(no).padStart(2, "0")}</span>
                    )}
                    <div className="min-w-0 flex-1 space-y-[3px]">
                      <p className="flex items-center gap-1.5">
                        <span className="text-[15px] font-bold text-ink">{m.display_name}</span>
                        {me && <span className="flex h-6 items-center rounded-full bg-brand px-2 text-xs font-medium text-white">나</span>}
                      </p>
                      {sub && <p className="text-[13px] text-ink-2">{sub}</p>}
                      {accent && !me && <p className="text-[13px] font-medium text-accent">{accent}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
            {!isTT && s.phase === "coffeechat_free" && <p className="rounded-2xl bg-strip/60 px-4 py-3 text-sm text-ink-2">이제 명함 탭의 오늘 만나면 좋을 분을 따라 자유롭게 이동해 보세요</p>}
            {!isTT && canSwitch && (
              <button type="button" onClick={() => setRound("tabletalk")} className="h-12 w-full rounded-2xl border border-navy bg-white text-base font-medium text-navy">
                테이블토크 배정 다시 보기
              </button>
            )}
          </section>
        </>
      )}

      {pending && (
        <Modal>
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-navy text-white" aria-hidden>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5L10 17.5L19 7.5" />
            </svg>
          </span>
          <p className="mt-4 text-lg font-bold leading-snug text-ink">
            커피챗 테이블 배정이
            <br />
            완료되었습니다
          </p>
          <p className="mt-2 text-[13px] text-ink-2">확인을 누르면 커피챗 배치 화면으로 이동합니다.</p>
          <button type="button" onClick={confirmNew} className="mt-5 h-[52px] w-full rounded-2xl bg-navy text-base font-bold text-white">
            확인
          </button>
        </Modal>
      )}
      {!pending && waiting && (
        <Modal>
          <span className="mx-auto block size-12 animate-spin rounded-full border-4 border-strip border-t-navy" aria-hidden />
          <p className="mt-4 text-lg font-bold leading-snug text-ink">
            곧 커피챗 테이블 배정이
            <br />
            완료될 예정입니다
          </p>
          <p className="mt-2 text-[13px] text-ink-2">
            잠시만 기다려 주십시오.
            <br />
            배정이 공개되면 이 화면이 자동으로 전환됩니다.
          </p>
        </Modal>
      )}
    </main>
  );
}

// 피그마 Notice / 배정 대기 · 배정 완료. 화면을 어둡게 덮고 가운데 흰 카드
function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0c1733]/45 px-9" role="dialog" aria-modal="true">
      <div className="w-full max-w-[321px] rounded-3xl bg-white px-6 py-7 text-center">{children}</div>
    </div>
  );
}
