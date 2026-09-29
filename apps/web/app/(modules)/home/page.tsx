// 홈 (담당: 성하). 내 주소 카드, 궤도(15초 갱신), 내 간단 소개.
"use client";

import { useEffect, useState } from "react";
import { api, type Me } from "@/lib/client";
import TopBar from "@/components/TopBar";
import SidBadge from "@/components/SidBadge";
import Loading from "@/components/Loading";
import Orbit, { type OrbitData } from "./Orbit";

const ORBIT_POLL_MS = 15_000;

type Intro = { offer_text: string; seek_text: string; topic_tags: string[]; intent_tags: string[] } | null;

export default function HomePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [orbit, setOrbit] = useState<OrbitData | null>(null);
  const [intro, setIntro] = useState<Intro>(null);

  useEffect(() => {
    api<Me>("/api/onboarding/me").then((r) => r.ok && setMe(r.data));
    api<{ intro: Intro }>("/api/home/intro").then((r) => r.ok && setIntro(r.data.intro));
    let alive = true;
    const loadOrbit = () => api<OrbitData>("/api/home/orbit").then((r) => alive && r.ok && setOrbit(r.data));
    loadOrbit();
    const t = setInterval(loadOrbit, ORBIT_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!me) return <Loading />;

  return (
    <>
      <TopBar
        title="The ORBIT"
        right={[...(me.participant.is_admin ? [{ href: "/ops", label: "운영 콘솔" }] : []), { href: "/home/guide", label: "사용설명서" }]}
      />
      <main className="space-y-4 p-4">
        <p className="text-sm text-gray-600">
          {me.participant.display_name} 님{me.participant.affiliation ? ` · ${me.participant.affiliation}` : ""}
        </p>
        <SidBadge sid={me.sid?.offer_sid ?? null} label={me.sid?.label} temp={me.sid?.is_temp} tableNo={me.table?.table_no ?? null} />

        {orbit ? <Orbit data={orbit} myName={me.participant.display_name} /> : <Loading text="궤도 불러오는 중" />}

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold">내 간단 소개</p>
          {intro ? (
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">지금 하는 일</dt>
                <dd>{intro.offer_text || "비어 있다"}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">오늘 찾는 사람</dt>
                <dd>{intro.seek_text || "비어 있다"}</dd>
              </div>
              {intro.topic_tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {intro.topic_tags.map((t) => (
                    <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-gray-400">소개가 없다</p>
          )}
        </section>
      </main>
    </>
  );
}
