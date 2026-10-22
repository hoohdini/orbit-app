"use client";
// 후기 완료(피그마 R-3). 서버(/api/event/feedback)에 저장된 내 후기를 보여 준다.
// 낸 기록이 없으면(주소로 바로 들어온 경우) 입력 화면으로 안내한다.
import { useEffect, useState } from "react";
import Link from "next/link";
import Stamp from "@/components/figma/Stamp";
import Loading from "@/components/Loading";
import { loadFeedback, type Feedback } from "../store";
import { ratingLabel, tagLabel } from "../choices";

export default function FeedbackDone() {
  const [f, setF] = useState<Feedback | null | undefined>(undefined);
    useEffect(() => {
    let alive = true;
    loadFeedback().then((v) => alive && setF(v));
    return () => {
      alive = false;
    };
  }, []);

  if (f === undefined) return <Loading />;
  if (f === null)
    return (
      <main className="px-5 pt-8 text-center">
        <p className="text-sm text-ink-2">아직 남긴 후기가 없습니다</p>
        <Link href="/event/feedback" className="mt-5 flex h-14 items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white">
          후기 남기기
        </Link>
      </main>
    );

  return (
    <main className="space-y-3 px-5 pt-5 pb-6">
      <section className="flex items-center gap-3.5 rounded-3xl border border-navy bg-strip px-5 py-4">
        <Stamp on size={52} />
        <div>
          <p className="text-base font-bold text-navy">후기 등록 완료</p>
          <p className="text-[13px] text-ink-2">후기 스탬프 획득</p>
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
      <p className="text-center text-[13px] font-medium text-ink-2">후기 미션 완료 · 1 / 1</p>
    </main>
  );
}
