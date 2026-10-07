// 첫 진입 카드(개발 지시서 v0.2 H-00). 로그인 직후 한 장: 내 테이블 · 좌석 번호, 명찰 착용 안내, 이용 동의 4항목, 확인하고 시작하기.
// 동의하지 않아도 시작할 수 있다(10/5 회의): 자리는 사전 등록 정보로 이미 배정돼 있고, 행사 중 기록(명함 교환, 만족도, 포스터 응답)만 하지 않는다.
// 한 번 고르면 다시 뜨지 않는다. 마이페이지에서 바꿀 수 있다. 명함 · 포스터 QR 로 들어온 사람은 next 로 돌아갈 곳이 넘어온다(없으면 명함 탭).
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type Me } from "@/lib/client";
import Loading from "@/components/Loading";
import { safeNext } from "../_next";

type Entry = Me & { consent?: "agreed" | "refused" | "pending"; table: (Me["table"] & { seat_no?: number | null }) | null };

const notices = [
  { title: "수집·이용 목적", body: "행사 참가자 간 네트워킹(테이블 배정, 명함 교환, 추천, 미션 운영)" },
  { title: "수집 항목", body: "사전 등록 정보(이름, 소속, 구분, 기수, 관심 태그, 하는 일 · 찾는 사람), 행사 중 앱 사용 기록(명함 교환, 만족도, 포스터 응답)" },
  { title: "보유 기간", body: "행사 종료 후 30일까지. 이후 즉시 파기" },
  { title: "거부할 권리", body: "동의하지 않아도 자리 안내와 식순은 볼 수 있다. 다만 명함 교환, 추천, 미션은 쓸 수 없다" },
];

export default function ConsentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EntryCard />
    </Suspense>
  );
}

function EntryCard() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const after = next ?? "/card";
  const [me, setMe] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Entry>("/api/onboarding/me").then((r) => {
      if (!r.ok) return router.replace("/onboarding");
      if (r.data.consent && r.data.consent !== "pending") return router.replace(after);
      setMe(r.data);
    });
  }, [router, after]);

  async function submit(agreed: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await api("/api/onboarding/consent", { json: { agreed } });
      if (!r.ok) return setError(r.message);
      router.replace(after);
    } finally {
      setBusy(false);
    }
  }

  if (!me) return <Loading />;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-10 pb-10 text-gray-900">
      <p className="text-sm text-gray-500">{me.participant.display_name} 님, 환영합니다</p>
      <div className="mt-3 rounded-3xl bg-black px-6 py-8 text-center text-white">
        {me.table ? (
          <>
            <p className="text-sm opacity-70">내 자리</p>
            <p className="mt-1 text-5xl font-bold">
              {me.table.table_no}번 테이블
              {me.table.seat_no ? <span className="mt-2 block text-3xl">{me.table.seat_no}번 좌석</span> : null}
            </p>
          </>
        ) : (
          <p className="text-base">자리 배정은 곧 공개됩니다</p>
        )}
      </div>
      <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm">테이블 위에 놓인 내 명찰을 착용해 주세요</p>

      <h2 className="mt-6 text-base font-bold">이용 동의</h2>
      <ul className="mt-2 space-y-2">
        {notices.map((n) => (
          <li key={n.title} className="rounded-xl border border-gray-200 p-3">
            <p className="text-sm font-semibold">{n.title}</p>
            <p className="mt-1 text-sm text-gray-700">{n.body}</p>
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button onClick={() => submit(true)} disabled={busy} className="mt-6 w-full rounded-xl bg-black py-3 text-lg font-semibold text-white disabled:bg-gray-300">
        동의하고 시작하기
      </button>
      <button onClick={() => submit(false)} disabled={busy} className="mt-2 w-full rounded-xl py-3 text-sm text-gray-500">
        동의하지 않고 시작하기
      </button>
    </main>
  );
}
