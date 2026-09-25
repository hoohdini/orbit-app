// 홈 (담당: 성하). 7단계에서 궤도·소개 카드를 채운다. 지금은 me 정보만 보여 준다.
"use client";

import { useEffect, useState } from "react";
import { api, type Me } from "@/lib/client";
import TopBar from "@/components/TopBar";
import SidBadge from "@/components/SidBadge";
import Loading from "@/components/Loading";

export default function HomePage() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/api/onboarding/me").then((r) => r.ok && setMe(r.data));
  }, []);
  if (!me) return <Loading />;
  return (
    <>
      <TopBar title="홈" right={[{ href: "/home/guide", label: "사용설명서" }]} />
      <main className="space-y-4 p-4">
        <p className="text-sm text-gray-600">{me.participant.display_name} 님</p>
        <SidBadge sid={me.sid?.offer_sid ?? null} label={me.sid?.label} temp={me.sid?.is_temp} tableNo={me.table?.table_no ?? null} />
        <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">궤도 시각화 자리 (7단계)</div>
      </main>
    </>
  );
}
