"use client";
// 미션 현황판(개발 지시서 v0.2 E-01 ~ E-06). 위에 진행 블록(n/4, 진행 바), 2×2 스탬프 그리드, 아래 고정 QR 버튼(공용 스캐너 /card/scan?via=event).
// 완료 타일은 실선 테두리와 체크, 미완료 타일은 점선 테두리와 다음 행동 문구만. 미참여를 탓하는 문구(아직, 미완료, 실패)는 쓰지 않는다.
// 서비스 소개 전에는 곧 시작됩니다로 덮고, 마감(wrapup) 뒤에는 읽기 전용이며 QR 버튼을 숨긴다. 판정은 서버가 한다(/api/poster/missions).
// 응모권은 명찰 번호로 전원에게 준다(앱 밖). 미션은 특별 시상 집계에만 쓴다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import { useOrbitState } from "@/components/useOrbitState";

type Mission = { key: "poster" | "recommended" | "first_meet" | "generation"; label: string; goal: number; count: number; done: boolean; completed_at: string | null };
type Missions = { window: "not_started" | "open" | "closed"; closed_at: string | null; missions: Mission[]; done_count: number; total: number; progress: number; completed_all_at: string | null };

const NEXT_STEP: Record<Mission["key"], { text: string; href: string | null }> = {
  poster: { text: "관심 있는 포스터의 QR 을 찍고 이유를 골라 주세요", href: null },
  recommended: { text: "명함 탭의 오늘 만나면 좋을 분과 명함을 교환해 보세요", href: "/card" },
  first_meet: { text: "처음 대화한 분과 명함을 교환하고 첫 대화를 체크해 주세요", href: "/card" },
  generation: { text: "재학생은 졸업생 · 교수 · 외부 분과, 그 밖의 분은 재학생과 명함을 교환해 보세요", href: "/card" },
};
const doneKey = "orbit:mission-complete-shown";
const POLL_MS = 15_000;

export default function MissionBoard() {
  const s = useOrbitState();
  const [m, setM] = useState<Missions | null>(null);
  const [modal, setModal] = useState(false);
  const refused = s?.consent === "refused";

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Missions>("/api/poster/missions").then((r) => {
        if (!alive || !r.ok) return;
        setM(r.data);
        if (r.data.done_count === r.data.total) {
          try {
            if (!localStorage.getItem(doneKey)) {
              localStorage.setItem(doneKey, "1");
              setModal(true);
            }
          } catch {}
        }
      });
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!m) return <Loading text="미션 불러오는 중" />;

  const allDone = m.done_count === m.total;

  return (
    <main className="relative space-y-4 p-4 pb-28">
      <section className="rounded-2xl bg-gray-50 p-4">
        {allDone && <p className="mb-2 rounded-lg bg-black px-3 py-1.5 text-center text-sm font-semibold text-white">미션 완료!</p>}
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">미션</p>
          <p className="text-2xl font-bold">
            {m.done_count}/{m.total}
          </p>
        </div>
        <div className="mt-2 h-2 rounded-full bg-gray-200">
          <div className="h-2 rounded-full bg-black" style={{ width: `${Math.round(m.progress * 100)}%` }} />
        </div>
        {m.window === "closed" && !allDone && <p className="mt-2 text-xs text-gray-500">미션 {m.done_count}/4 · 마감되었습니다</p>}
        {m.window === "closed" && allDone && <p className="mt-2 text-xs text-gray-500">마감되었습니다</p>}
      </section>

      {refused && <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">이용 동의를 하지 않아 미션은 기록되지 않는다. 마이페이지에서 다시 동의할 수 있다</p>}

      <section className="grid grid-cols-2 gap-3">
        {m.missions.map((x, i) => (
          <div key={x.key} className={`min-h-36 rounded-2xl p-3 ${x.done ? "border-2 border-black bg-white" : "border-2 border-dashed border-gray-300 bg-white"}`}>
            <div className="flex items-start justify-between">
              <p className="text-xs text-gray-500">{["①", "②", "③", "④"][i]}</p>
              {x.done ? <span className="text-lg">✓</span> : x.goal > 1 && <span className="text-xs text-gray-500">{x.count}/{x.goal}</span>}
            </div>
            <p className="mt-1 text-sm font-semibold">{x.label}</p>
            {!x.done && m.window !== "closed" && (
              <p className="mt-2 text-xs text-gray-600">
                {NEXT_STEP[x.key].href ? (
                  <Link href={NEXT_STEP[x.key].href!} className="underline">
                    {NEXT_STEP[x.key].text}
                  </Link>
                ) : (
                  NEXT_STEP[x.key].text
                )}
              </p>
            )}
          </div>
        ))}
      </section>

      {m.window === "open" && !refused && (
        <div className="fixed inset-x-0 bottom-16 z-10 mx-auto max-w-md px-4">
          <Link href="/card/scan?via=event" className="block rounded-2xl bg-black py-4 text-center text-base font-bold text-white shadow-lg">
            QR 찍기
          </Link>
        </div>
      )}

      {m.window === "not_started" && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/85">
          <p className="text-lg font-semibold text-gray-700">곧 시작됩니다</p>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true" onClick={() => setModal(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center">
            <p className="text-2xl font-bold">미션 완료!</p>
            <p className="mt-2 text-sm text-gray-600">네 미션을 모두 마쳤어요. 특별 시상은 마무리 시간에 발표됩니다</p>
            <button type="button" className="mt-5 w-full rounded-xl bg-black py-3 text-sm font-semibold text-white">
              닫기
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
