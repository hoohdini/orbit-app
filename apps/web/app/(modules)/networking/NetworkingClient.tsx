"use client";
// 네트워킹 탭 화면(개발 지시서 v0.2 N-01 ~ N-06). 궤도는 위, 명단은 아래. 자유 이동용 추천은 넣지 않는다(명함 탭 H-04).
// 어느 배정을 보여 줄지는 상태 API 로 정한다:
// - 커피챗 배정이 공개됐고 이 기기에서 아직 확인하지 않았으면 "새 테이블이 배정됐어요" 카드를 먼저 띄운다(N-06). 확인 전에는 테이블토크 화면 그대로
// - 확인했으면 커피챗 화면(N-04 · N-05). 테이블토크 화면도 위 전환 버튼으로 다시 볼 수 있다
// 마지막으로 받은 배정은 기기에 저장해 통신이 끊겨도 보여 준다(N-02). 대화거리 · 상대 현재 위치는 보여 주지 않는다(결정 2).
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import { useOrbitState, refreshOrbitState } from "@/components/useOrbitState";
import Orbit, { OrbitRoom } from "./Orbit";

type Member = { id: string; display_name: string; affiliation: string | null; role: string; cohort: number | null; seat_no?: number | null; career_line: string; offer_text: string; reason?: string | null };
type Assignment = { no: number; members: Member[] };
type OrbitData = {
  me: { table_no: number; grid: { row: number; col: number } | null };
  inner: { id: string; display_name: string }[];
  outer: { table_no: number; label: string | null; grid: { row: number; col: number } | null }[];
};
type Round = "tabletalk" | "coffeechat";
type View = { assignment: Assignment; orbit: OrbitData | null; offline: boolean };

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
  const [meName, setMeName] = useState("나");
  const [meId, setMeId] = useState<string | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [view, setView] = useState<View | "unpublished" | null>(null);
  const [ackTick, setAckTick] = useState(0);

  const ccVersion = s?.coffeechat ? s.published.coffeechat : null;
  const acked = ccVersion !== null && (ackTick >= 0 && readLocal<boolean>(ackKey(ccVersion)) === true);
  const pending = ccVersion !== null && !acked; // 새 배정 안내 카드를 띄울 때
  const shown: Round = round ?? (ccVersion !== null && acked ? "coffeechat" : "tabletalk");

  useEffect(() => {
    api<{ participant: { id: string; display_name: string } }>("/api/onboarding/me").then((r) => {
      if (r.ok) {
        setMeId(r.data.participant.id);
        setMeName(r.data.participant.display_name);
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

  const canSwitch = ccVersion !== null && acked && s.tabletalk;
  const label = shown === "tabletalk" ? "테이블" : "그룹";

  return (
    <main className="space-y-4 p-4">
      {pending && (
        <section className="rounded-2xl bg-black p-5 text-white">
          <p className="text-lg font-bold">새 테이블이 배정됐어요</p>
          <p className="mt-1 text-sm opacity-80">커피챗 {s.coffeechat?.group_no}번 그룹으로 이동해 주세요</p>
          <button type="button" onClick={confirmNew} className="mt-4 w-full rounded-xl bg-white py-3 text-sm font-semibold text-black">
            확인
          </button>
        </section>
      )}

      {canSwitch && (
        <div className="grid grid-cols-2 rounded-xl bg-gray-100 p-1 text-sm">
          {(["tabletalk", "coffeechat"] as Round[]).map((r) => (
            <button key={r} type="button" onClick={() => setRound(r)} className={`rounded-lg py-1.5 ${shown === r ? "bg-white font-semibold shadow-sm" : "text-gray-500"}`}>
              {r === "tabletalk" ? "테이블토크" : "커피챗"}
            </button>
          ))}
        </div>
      )}

      {view === "unpublished" ? (
        <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          {shown === "tabletalk" ? "테이블 배정이 곧 공개됩니다" : "커피챗 배정은 포스터 세션 뒤에 공개됩니다"}
        </p>
      ) : (
        <>
          <section className="text-center">
            <p className="text-xs text-gray-500">{shown === "tabletalk" ? "테이블토크" : "커피챗"}</p>
            <p className="text-6xl font-bold">
              {view.assignment.no}
              <span className="ml-1 text-2xl">번 {label}</span>
            </p>
            {view.offline && <p className="mt-1 text-xs text-yellow-700">연결이 끊겨 마지막으로 받은 배정을 보여 준다</p>}
          </section>

          {view.orbit && (
            <section className="rounded-2xl border border-gray-200 bg-white p-3">
              <Orbit me={meName} people={view.orbit.inner} />
              {view.orbit.outer.length > 0 && (
                <div className="mt-2">
                  <p className="mb-2 text-xs text-gray-500">{shown === "tabletalk" ? "행사장 테이블 배치" : "가까운 그룹"}</p>
                  <OrbitRoom mine={{ table_no: view.orbit.me.table_no, label: null, grid: view.orbit.me.grid }} others={view.orbit.outer} />
                </div>
              )}
            </section>
          )}

          {shown === "coffeechat" && s.phase === "coffeechat_free" && (
            <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">이제 명함 탭의 오늘 만나면 좋을 분을 따라 자유롭게 이동해 보세요</p>
          )}

          <section>
            <h2 className="text-sm font-semibold">
              {shown === "tabletalk" ? "자리 순서" : "함께하는 분"} <span className="font-normal text-gray-500">{view.assignment.members.length}명</span>
            </h2>
            <ul className="mt-2 space-y-2">
              {view.assignment.members.map((m) => (
                <li key={m.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <p className="text-sm">
                    {m.seat_no != null && <span className="mr-2 text-xs text-gray-400">{m.seat_no}</span>}
                    <span className="font-semibold">{m.display_name}</span>
                    {m.id === meId && <span className="ml-1 rounded bg-gray-900 px-1 text-[10px] text-white">나</span>}
                    {m.cohort != null && <span className="ml-1 text-gray-500">{m.cohort}기</span>}
                    {m.affiliation && <span className="ml-2 text-gray-500">{m.affiliation}</span>}
                  </p>
                  {m.career_line && <p className="mt-0.5 text-xs text-gray-600">{m.career_line}</p>}
                  {shown === "coffeechat" && m.reason && <p className="mt-1 text-xs text-gray-800">{m.reason}</p>}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
