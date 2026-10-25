"use client";
// 후기 완료(피그마 R-3). 서버(/api/event/feedback)에 저장된 내 후기를 보여 준다.
// 스탬프 문구는 서버 미션 판정(/api/poster/missions 의 feedback.done)을 따른다. 판정이 스탬프 없음이면 획득이라고 쓰지 않는다(10/22).
// 낸 기록이 없으면(주소로 바로 들어온 경우) 입력 화면으로 안내한다. 불러오지 못했으면 없다고 하지 않고 다시 시도를 띄운다.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Stamp from "@/components/figma/Stamp";
import Loading from "@/components/Loading";
import { api } from "@/lib/client";
import { loadFeedback, type Feedback } from "../store";
import { ratingLabel, tagLabel } from "../choices";
import { USE_MOCK, mockMissions } from "../../mock";
import type { Missions } from "../../missions";

// stamp: true 받음 · false 못 받음 · null 판정을 불러오지 못함
type View = { kind: "loading" } | { kind: "error" } | { kind: "none" } | { kind: "shown"; f: Feedback; stamp: boolean | null };

// 후기 스탬프 판정
async function stampOf(): Promise<boolean | null> {
  if (USE_MOCK) return mockMissions().missions.find((x) => x.key === "feedback")?.done ?? null;
  const r = await api<Missions>("/api/poster/missions");
  return r.ok ? (r.data.missions.find((x) => x.key === "feedback")?.done ?? null) : null;
}

// 서버 후기가 있으면 그것, 없으면 없음, 못 불러왔으면 불러오기 실패
async function resolve(): Promise<View> {
  const [r, stamp] = await Promise.all([loadFeedback(), stampOf()]);
  if (!r.ok) return { kind: "error" };
  return r.feedback ? { kind: "shown", f: r.feedback, stamp } : { kind: "none" };
}

export default function FeedbackDone() {
  const [v, setV] = useState<View>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    resolve().then((next) => alive && setV(next));
    return () => {
      alive = false;
    };
  }, []);

  const retry = useCallback(() => {
    setV({ kind: "loading" });
    resolve().then(setV);
  }, []);

  if (v.kind === "loading") return <Loading />;
  if (v.kind === "error")
    return (
      <main className="px-5 pt-8 text-center">
        <p className="text-sm text-ink-2">후기를 불러오지 못했습니다</p>
        <button type="button" onClick={retry} className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white">
          다시 시도
        </button>
      </main>
    );
  if (v.kind === "none")
    return (
      <main className="px-5 pt-8 text-center">
        <p className="text-sm text-ink-2">아직 남긴 후기가 없습니다</p>
        <Link href="/event/feedback" className="mt-5 flex h-14 items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white">
          후기 남기기
        </Link>
      </main>
    );

  const { f, stamp } = v;
  // 조기 퇴장한 사람의 후기는 스탬프가 없다(10/25 민찬 결정). 그때는 스탬프 줄을 따로 쓰지 않는다
  const sub = stamp === true ? "후기 스탬프 획득" : stamp === false ? "" : "스탬프 상태를 불러오지 못했습니다";

  return (
    <main className="space-y-3 px-5 pt-5 pb-6">
      <section className="flex items-center gap-3.5 rounded-3xl border border-navy bg-strip px-5 py-4">
        <Stamp on={stamp === true} size={52} />
        <div>
          <p className="text-base font-bold text-navy">후기 등록 완료</p>
          {sub && <p className="text-[13px] text-ink-2">{sub}</p>}
        </div>
      </section>

      <section className="rounded-3xl border border-navy bg-white px-5 py-4">
        <h2 className="text-[17px] font-medium text-navy">내가 남긴 후기</h2>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-ink-2">만족도</span>
          <span className="text-[22px] font-bold text-navy">{ratingLabel(f.rating)}</span>
        </p>
        {f.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {f.tags.map((k) => (
              <span key={k} className="rounded-full border-[1.5px] border-navy bg-strip px-3.5 py-1.5 text-sm font-medium text-navy">
                {tagLabel(k)}
              </span>
            ))}
          </div>
        )}
        {f.comment && <p className="mt-3 text-sm leading-relaxed text-ink">{f.comment}</p>}
      </section>

      <Link href="/event" className="flex h-14 items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white">
        현황판으로
      </Link>
      {stamp === true && <p className="text-center text-[13px] font-medium text-ink-2">후기 미션 완료 · 1 / 1</p>}
    </main>
  );
}
