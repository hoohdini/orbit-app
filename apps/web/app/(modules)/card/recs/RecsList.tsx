"use client";
// 오늘 만나면 좋을 분 번호 목록(피그마 Seat List). 번호는 가까운 순서, 이름 · 소속 · Offer(하는 일 원문) 세 줄.
// 이미 교환한 분은 교환함, 아직 입장하지 않은 분은 입장 전 칩을 붙인다(목록은 행사 내내 그대로라 빼지 않는다).
// 세션 중(테이블토크 · 커피챗 첫 배치)에는 서버가 접어서 보낸다(folded).
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useOrbitState } from "@/components/useOrbitState";

type RecPerson = { rank: number; id: string; display_name: string; affiliation: string | null; role: string; cohort: number | null; career_line: string; offer_text: string; exchanged: boolean; checked_in: boolean };
type Recs = { folded: boolean; people: RecPerson[]; almost_done: boolean };

const roleLabel: Record<string, string> = { student: "재학생", alumni: "졸업생", professor: "교수", staff: "운영진", other: "참가자" };

function subline(p: RecPerson): string {
  return [p.affiliation, p.cohort != null ? `${p.cohort}기` : null, roleLabel[p.role]].filter(Boolean).join(" · ");
}

export default function RecsList() {
  const state = useOrbitState();
  const open = state?.recs_open ?? true;
  const [recs, setRecs] = useState<Recs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Recs>("/api/card/recs").then((r) => {
        if (!alive) return;
        if (r.ok) setRecs(r.data);
        else setError(r.message);
      });
    load();
    window.addEventListener("orbit:inbox-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("orbit:inbox-changed", load);
    };
  }, [open]);

  const box = "mx-5 mt-[7px] overflow-hidden rounded-3xl border border-line bg-white";
  if (error) return <p className={`${box} p-6 text-center text-sm text-ink-2`}>{error}</p>;
  if (!recs) return <p className={`${box} p-6 text-center text-sm text-ink-3`}>불러오는 중</p>;
  if (recs.folded) return <p className={`${box} p-6 text-center text-sm text-ink-2`}>지금은 앞에 계신 분과 대화하는 시간이에요. 세션이 끝나면 다시 볼 수 있어요</p>;
  if (recs.people.length === 0) return <p className={`${box} p-6 text-center text-sm text-ink-2`}>추천 목록이 곧 준비돼요</p>;

  return (
    <>
      <ol className={`${box} py-1`}>
        {recs.people.map((p, i) => (
          <li key={p.id} className={`flex items-start gap-[14px] px-5 py-[14px] ${i < recs.people.length - 1 ? "border-b border-line" : ""} ${p.exchanged ? "opacity-60" : ""}`}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-strip text-xs font-medium text-navy">{String(p.rank).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1 space-y-[3px]">
              <p className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-ink">{p.display_name}</span>
                {p.exchanged && <span className="rounded-full bg-navy px-2 py-0.5 text-[11px] text-white">교환함</span>}
                {!p.checked_in && !p.exchanged && <span className="rounded-full bg-field px-2 py-0.5 text-[11px] text-ink-3">입장 전</span>}
              </p>
              {subline(p) && <p className="text-[13px] text-ink-2">{subline(p)}</p>}
              {p.offer_text && <p className="text-[13px] font-medium text-accent">Offer · {p.offer_text}</p>}
            </div>
          </li>
        ))}
      </ol>
      {recs.almost_done && <p className="mt-3 text-center text-xs text-ink-3">목록의 모든 분과 명함을 주고받았어요</p>}
      <p className="mx-5 mt-3 text-center text-xs text-ink-3">
        만나면{" "}
        <Link href="/card/scan?via=card" className="underline">
          명함 스캔하기
        </Link>
        로 인사를 남겨 보세요
      </p>
    </>
  );
}
