"use client";
// 포스터 세션 목록(피그마 P-0, A12 · A13 · A31). QR 을 한 번이라도 찍은 포스터만 눌러서 요약(/poster?id=)으로 간다. 안 찍은 포스터는 흐리게.
// 오른쪽 스탬프 = 그 포스터 퀴즈를 맞혔는지(미션 ②). 위 숫자 = 찍은 포스터 수 / 전체
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import Stamp from "@/components/figma/Stamp";

type Poster = { id: number; code: string; title: string; presenter: string | null; tags: string[]; scanned: boolean; my_reason: string | null; has_quiz: boolean; quiz_solved: boolean };
type List = { posters: Poster[]; total: number; scanned_count: number; progress: { responses: number; poster_goal: number; quiz_stamps: number; quiz_goal: number } };

export default function PosterList() {
  const [d, setD] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<List>("/api/poster/list").then((r) => (r.ok ? setD(r.data) : setError(r.message)));
  }, []);

  if (error) return <p className="m-5 rounded-2xl bg-field p-4 text-sm text-ink-2">{error}</p>;
  if (!d) return <Loading />;

  return (
    <main className="space-y-4 px-5 py-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">포스터 QR을 찍어 보세요</p>
        <span className="text-[13px] font-medium text-ink-2">
          {d.scanned_count}/{d.total}
        </span>
      </div>
      <p className="text-xs text-ink-3">
        포스터 관심도 {Math.min(d.progress.responses, d.progress.poster_goal)}/{d.progress.poster_goal} · 퀴즈 스탬프 {Math.min(d.progress.quiz_stamps, d.progress.quiz_goal)}/{d.progress.quiz_goal}
      </p>
      {d.posters.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-ink-2">포스터 목록이 곧 준비됩니다</p>
      ) : (
        <ol className="overflow-hidden rounded-3xl border border-navy bg-white py-1">
          {d.posters.map((p, i) => {
            const row = (
              <>
                <span className="w-6 shrink-0 text-sm font-medium text-navy">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[15px] font-bold ${p.scanned ? "text-ink" : "text-ink-3"}`}>{p.title}</span>
                  <span className="block truncate text-xs text-ink-3">{p.scanned ? [p.tags[0], p.presenter].filter(Boolean).join(" · ") : "QR을 찍으면 열립니다"}</span>
                </span>
                <Stamp on={p.quiz_solved} size={32} />
              </>
            );
            const cls = `flex items-center gap-3 px-5 py-3 ${i < d.posters.length - 1 ? "border-b border-line" : ""}`;
            return (
              <li key={p.id}>
                {p.scanned ? (
                  <Link href={`/poster?id=${p.id}`} className={cls}>
                    {row}
                  </Link>
                ) : (
                  <div className={`${cls} bg-field/60`} aria-disabled>
                    {row}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Link href="/card/scan?via=event" className="flex h-14 items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white">
        QR 스캔하기
      </Link>
    </main>
  );
}
