"use client";
// 네트워킹 미션 상세(피그마 E-03 ~ E-05, A26 · A27). 진행 n/목표, 설명, 아래 명함 탭으로 가기.
// 새로운 연결(E-04)은 첫 대화로 체크된 교환 목록을 같이 보인다(/api/card/wallet 의 first_meet true · 성립한 교환)
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import Stamp from "@/components/figma/Stamp";
import type { Card } from "@/app/api/card/_lib";
import { NO, type Missions } from "../../missions";

type Key = "recommended" | "first_meet" | "generation";
const COPY: Record<Key, { head: string; body: string }> = {
  recommended: { head: "오늘 만나면 좋을 분과 명함을 교환해 보세요", body: "홈의 ‘오늘 만나면 좋을 분’에 떴던 분 1명과 명함을 교환하면 완료돼요." },
  first_meet: { head: "처음 만난 분과 명함을 교환해 보세요", body: "첫 대화로 체크된 명함 교환 2건이면 완료돼요." },
  generation: { head: "나와 구분이 다른 분과 명함을 교환해 보세요", body: "재학생과 졸업생·교수·외부 사이에서, 나와 구분이 다른 분 1명과 명함을 교환하면 완료돼요." },
};
const roleLabel: Record<string, string> = { student: "재학생", alumni: "졸업생", professor: "교수", staff: "운영진", other: "외부" };

export default function MissionDetail({ mkey }: { mkey: Key }) {
  const [m, setM] = useState<Missions | null>(null);
  const [firsts, setFirsts] = useState<Card[] | null>(null);

  useEffect(() => {
    api<Missions>("/api/poster/missions").then((r) => r.ok && setM(r.data));
    if (mkey === "first_meet") api<{ cards: Card[] }>("/api/card/wallet").then((r) => r.ok && setFirsts(r.data.cards.filter((c) => c.first_meet === true && c.status === "confirmed")));
  }, [mkey]);

  if (!m) return <Loading />;
  const mission = m.missions.find((x) => x.key === mkey)!;
  const copy = COPY[mkey];

  return (
    <main className="flex min-h-[calc(100vh-260px)] flex-col px-5 py-5">
      <p className="text-xs font-medium text-ink-2">미션 {NO[mkey]}</p>
      <h2 className="mt-1 text-xl font-bold leading-snug text-ink">{copy.head}</h2>
      <p className="mt-2 text-[13px] text-ink-2">{copy.body}</p>

      <div className={`mt-5 flex items-center gap-4 rounded-3xl border px-5 py-4 ${mission.done ? "border-navy bg-strip" : "border-[#a6abb3] bg-white"}`}>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-2">진행</span>
            <span className="text-lg font-bold text-navy">
              {mission.count} / {mission.goal}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-field">
            <div className="h-full rounded-full bg-navy" style={{ width: `${Math.min(100, (mission.count / mission.goal) * 100)}%` }} />
          </div>
        </div>
        <Stamp on={mission.done} size={44} />
      </div>

      {mkey === "first_meet" && (
        <section className="mt-6">
          <p className="text-sm font-bold text-ink">첫 대화로 체크한 교환</p>
          <ul className="mt-2 space-y-2">
            {(firsts ?? []).map((c) => (
              <li key={c.id}>
                <Link href={`/card/wallet/${c.id}`} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{c.display_name.slice(0, 1)}</span>
                  <span>
                    <span className="block text-sm font-bold text-ink">{c.display_name}</span>
                    <span className="block text-xs text-ink-2">{[roleLabel[c.role], c.label ?? c.affiliation].filter(Boolean).join(" · ")}</span>
                  </span>
                </Link>
              </li>
            ))}
            {firsts && firsts.length < mission.goal && <li className="rounded-2xl border border-dashed border-line px-4 py-3 text-center text-xs text-ink-3">다음 첫 대화가 여기에 담겨요</li>}
          </ul>
        </section>
      )}

      <div className="flex-1" />
      <Link href="/card" className="mt-8 flex h-14 items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white">
        명함 탭으로 가기
      </Link>
    </main>
  );
}
