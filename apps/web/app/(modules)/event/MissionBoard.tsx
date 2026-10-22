"use client";
// 이벤트·미션 탭 현황판(피그마 E-01 기본 · 진행 · 전체 완료 · 마감, 10/21 개편). 포스터 미션 2개 타일, 네트워킹 미션(명함 교환 한 줄, 스탬프 2개), 후기 미션 한 줄, 미션 스탬프 5칸, 아래 QR 스캔하기.
// 타일을 누르면 ① ② 는 포스터 세션 목록, ③ 은 명함 탭(/card), ④ 는 후기 화면으로 간다. 포스터 목록은 완료한 뒤에도 들어갈 수 있다. 마감 뒤에는 모든 타일이 동작 없음(A01 ~ A05).
// 스탬프 5칸을 모두 모으면 미션 완료! 모달을 한 번 띄운다(S02). 마감(wrapup 뒤)이면 읽기 전용이고 QR 버튼을 막는다(S01).
// 서버 응답은 /api/poster/missions. USE_MOCK 을 켜면 mock.ts 의 가짜 데이터를 쓴다.
// 탭은 처음부터 열려 있지만 미션 기록은 테이블토크부터 센다(10/11 성하 결정: 서버 미션 구간 그대로).
// 후기 타일(④)은 커피챗이 끝난 뒤(feedback_open, wrapup · award)에만 열린다. 그 전은 잠그고 '커피챗이 끝나면 열립니다'를 보이며, 미션 마감 뒤에도 후기 타일만은 열려 있다(10/22 민찬 결정).
// 불러오지 못하면(401 · 500 · 네트워크) 불러오는 중에 머물지 않고 다시 시도를 띄운다. 폴링은 계속 다시 부른다.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type ApiResult } from "@/lib/client";
import Loading from "@/components/Loading";
import Stamp from "@/components/figma/Stamp";
import { useOrbitState } from "@/components/useOrbitState";
import { HREF, NO, TODO, stampsOf, type Mission, type Missions } from "./missions";
import { USE_MOCK, mockMissions } from "./mock";

const doneKey = "orbit:mission-complete-shown";
const POLL_MS = 15_000;

export default function MissionBoard() {
  const s = useOrbitState();
  const [m, setM] = useState<Missions | null>(null);
  const [modal, setModal] = useState(false);
  const [failed, setFailed] = useState(false);
  const refused = s?.consent === "refused";

  const load = useCallback((alive: () => boolean = () => true) => {
    const req: Promise<ApiResult<Missions>> = USE_MOCK ? Promise.resolve({ ok: true, data: mockMissions(), status: 200 }) : api<Missions>("/api/poster/missions");
    return req.then((r) => {
      if (!alive()) return;
      setFailed(!r.ok); // 이미 받은 현황이 있으면 그대로 두고, 처음부터 못 받았을 때만 오류 화면이 된다
      if (!r.ok) return;
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
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => load(() => alive);
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [load]);

  if (!m && failed)
    return (
      <main className="px-5 pt-8 text-center">
        <p className="text-sm text-ink-2">미션 현황을 불러오지 못했습니다</p>
        <button type="button" onClick={() => (setFailed(false), load())} className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white">
          다시 시도
        </button>
      </main>
    );
  if (!m) return <Loading />;
  const closed = m.window === "closed";
  const by = (k: Mission["key"]) => m.missions.find((x) => x.key === k)!;
  const posterSet = [by("poster"), by("quiz")];
  const exchange = by("exchange");
  const feedback = by("feedback");

  return (
    <main className="space-y-8 px-5 pt-4 pb-6">
      {closed && (
        <p className="rounded-2xl bg-strip px-4 py-3 text-center text-sm font-medium text-navy">
          미션 {m.done_count}/{m.total} · 마감되었습니다{m.feedback_open && !feedback.done ? " · 후기는 지금 남길 수 있습니다" : ""}
        </p>
      )}
      {refused && <p className="rounded-2xl bg-field px-4 py-3 text-sm text-ink-2">이용 동의를 하지 않아 미션 기록이 남지 않습니다. 후기는 누가 냈는지 남기지 않고 받습니다. 마이페이지에서 다시 동의할 수 있습니다</p>}

      <section className="space-y-2.5">
        <Head title="포스터 미션" done={posterSet.filter((x) => x.done).length} total={2} />
        <div className="grid grid-cols-2 gap-3">
          {posterSet.map((x) => (
            <Tile key={x.key} m={x} closed={closed} tile />
          ))}
        </div>
      </section>

      <section className="space-y-2.5">
        <Head title="네트워킹 미션" done={stampsOf(exchange).filter(Boolean).length} total={2} />
        <Tile m={exchange} closed={closed} />
      </section>

      <section className="space-y-2.5">
        <Head title="후기 미션" done={feedback.done ? 1 : 0} total={1} />
        {/* 후기는 미션 마감과 상관없이 feedback_open 일 때만 열린다 */}
        <Tile m={feedback} closed={!m.feedback_open} lockedHint={m.feedback_open ? undefined : "커피챗이 끝나면 열립니다"} />
      </section>

      <section className="rounded-3xl border border-navy bg-strip px-5 pt-3 pb-5">
        <p className="text-[15px] font-bold tracking-[-0.15px] text-ink">미션 스탬프</p>
        <div className="mx-auto mt-2 grid max-w-[313px] grid-cols-5 gap-[min(12px,2.5vw)]">
          {/* 모은 개수만큼 왼쪽부터 채운다. 칸은 폭에 맞춰 줄어든다(최대 53) */}
          {Array.from({ length: m.total }, (_, i) => (
            <Stamp key={i} on={i < m.done_count} fluid />
          ))}
        </div>
      </section>

      {closed ? (
        <span className="flex h-14 items-center justify-center rounded-2xl bg-field text-lg font-bold text-ink-3">QR 스캔하기</span>
      ) : (
        <Link href="/card/scan?via=event" className="flex h-14 items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white">
          QR 스캔하기
        </Link>
      )}

      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0c1733]/45 px-10" role="dialog" aria-modal="true">
          <div className="w-full max-w-[313px] rounded-3xl bg-white px-6 pt-8 pb-6 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-navy text-white" aria-hidden>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5L10 17.5L19 7.5" />
              </svg>
            </span>
            <p className="mt-3 text-lg font-bold text-ink">미션 완료!</p>
            <button type="button" onClick={() => setModal(false)} className="mt-5 h-14 w-full rounded-2xl bg-navy text-base font-bold text-white">
              확인
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Head({ title, done, total }: { title: string; done: number; total: number }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[17px] font-bold text-navy">{title}</h2>
      <span className="text-[13px] font-medium text-ink-2">
        {done}/{total}
      </span>
    </div>
  );
}

// 미션 타일(포스터 미션은 2칸 타일, 네트워킹 미션은 한 줄). 완료는 연한 남색 바탕 · 진한 테두리 · 스탬프
// lockedHint 가 있으면 할 일 문구 대신 그 안내를 보인다(후기 타일, 커피챗 전)
function Tile({ m, closed, tile = false, lockedHint }: { m: Mission; closed: boolean; tile?: boolean; lockedHint?: string }) {
  // 스탬프가 여러 개인 미션(명함 교환 3명 · 5명)은 칸마다 따로 찍힌다
  const flags = m.milestones ? stampsOf(m) : [m.done];
  const body = tile ? (
    <>
      <p className="text-xs font-medium text-ink-2">미션 {NO[m.key]}</p>
      <p className="mt-1 text-[17px] font-bold text-ink">{m.label}</p>
      <p className={`mt-1 text-[13px] ${m.done ? "font-medium text-navy" : "text-ink-2"}`}>{m.done ? "완료" : TODO[m.key](m)}</p>
    </>
  ) : (
    <>
      <p className="flex items-center gap-2">
        <span className="text-xs font-medium text-ink-2">미션 {NO[m.key]}</span>
        <span className="text-base font-bold text-ink">{m.label}</span>
      </p>
      <p className={`text-[13px] ${m.done ? "font-medium text-navy" : "text-ink-2"}`}>{m.done ? "완료" : (lockedHint ?? TODO[m.key](m))}</p>
    </>
  );
  const cls = `relative block rounded-[20px] border-[1.5px] ${tile ? "px-4 py-[14px]" : `px-4 py-[11px] ${flags.length > 1 ? "pr-[104px]" : "pr-16"}`} ${m.done ? "border-navy bg-strip" : "border-[#a6abb3] bg-white"}`;
  const stamp = (
    <span className={`absolute flex gap-1.5 ${tile ? "right-3 top-2.5" : "right-4 top-1/2 -translate-y-1/2"}`}>
      {flags.map((on, i) => (
        <Stamp key={i} on={on} />
      ))}
    </span>
  );
  // 완료한 타일도 포스터 목록은 다시 열 수 있다. 명함 · 후기는 완료하면 동작 없음. 마감 뒤에는 후기 말고 모두 동작 없음(후기는 closed 대신 feedback_open 을 받는다)
  const reopen = m.key === "poster" || m.key === "quiz";
  if (closed || (m.done && !reopen))
    return (
      <div className={cls}>
        {body}
        {stamp}
      </div>
    );
  return (
    <Link href={HREF[m.key]} className={cls}>
      {body}
      {stamp}
    </Link>
  );
}
