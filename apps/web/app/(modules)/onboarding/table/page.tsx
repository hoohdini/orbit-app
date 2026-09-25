// 테이블 번호 안내. 배정이 아직 공개되지 않았으면 10초마다 다시 확인한다.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Me } from "@/lib/client";
import Loading from "@/components/Loading";
import SidBadge from "@/components/SidBadge";

const POLL_MS = 10_000;

export default function TablePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function load() {
      const r = await api<Me>("/api/onboarding/me");
      if (!alive) return;
      if (!r.ok) return router.replace("/onboarding");
      if (!r.data.consented) return router.replace("/onboarding/consent");
      setMe(r.data);
      if (!r.data.table) {
        timer = setTimeout(() => {
          setTries((t) => t + 1);
          load();
        }, POLL_MS);
      }
    }
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  if (!me) return <Loading text="테이블 정보 확인 중" />;

  if (!me.table) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
        <h1 className="mt-6 text-xl font-bold">테이블 배정을 준비하고 있다</h1>
        <p className="mt-2 text-sm text-gray-600">운영진이 배정을 공개하면 여기에 바로 표시된다. 화면을 닫지 않아도 된다.</p>
        <p className="mt-6 text-xs text-gray-400">확인 {tries + 1}회</p>
        <button onClick={() => router.replace("/home")} className="mt-8 rounded-xl border border-gray-300 px-5 py-2 text-sm">
          먼저 홈으로 가기
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-16 pb-10">
      <p className="text-sm text-gray-500">{me.participant.display_name} 님의 테이블토크 자리</p>
      <div className="mt-4 rounded-3xl bg-black px-6 py-10 text-center text-white">
        <p className="text-sm opacity-70">테이블</p>
        <p className="mt-1 text-7xl font-bold">{me.table.table_no}</p>
        {me.table.label && <p className="mt-3 text-base opacity-90">{me.table.label}</p>}
      </div>
      <div className="mt-6">
        <SidBadge sid={me.sid?.offer_sid ?? null} label={me.sid?.label} temp={me.sid?.is_temp} />
      </div>
      <p className="mt-4 text-sm text-gray-600">주소 앞자리가 같은 사람은 비슷한 관심사를 가진 사람이다. 홈의 궤도에서 확인할 수 있다.</p>
      <button onClick={() => router.replace("/home")} className="mt-8 w-full rounded-xl bg-black py-3 text-lg font-semibold text-white">
        홈으로
      </button>
    </main>
  );
}
