// 개인정보 동의 화면. 첫 로그인 직후 한 번만 지나간다.
// 명함 · 포스터 QR 로 들어온 사람은 next 로 돌아갈 곳이 넘어오므로 동의 뒤 그곳으로 보낸다(없으면 테이블 안내).
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type Me } from "@/lib/client";
import Loading from "@/components/Loading";
import { safeNext } from "../_next";

const notices = [
  { title: "수집·이용 목적", body: "행사 참가자 간 네트워킹(테이블 배정, 명함 교환, 추천, 스탬프 운영)" },
  { title: "수집 항목", body: "이름, 소속, 구분, 기수, 관심 태그, 한 줄 소개(하는 일·찾는 사람), 행사 중 앱 사용 기록(명함 교환, 스탬프, 만족도)" },
  { title: "보유 기간", body: "행사 종료 후 30일까지. 이후 즉시 파기" },
  { title: "거부할 권리", body: "동의하지 않을 수 있다. 다만 동의하지 않으면 이 앱의 배정·추천 기능을 쓸 수 없다" },
];

export default function ConsentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ConsentForm />
    </Suspense>
  );
}

function ConsentForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const after = next ?? "/onboarding/table";
  const [me, setMe] = useState<Me | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/api/onboarding/me").then((r) => {
      if (!r.ok) return router.replace("/onboarding");
      if (r.data.consented) return router.replace(after);
      setMe(r.data);
    });
  }, [router, after]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api("/api/onboarding/consent", { json: { agreed: true } });
      if (!r.ok) return setError(r.message);
      router.replace(after);
    } finally {
      setBusy(false);
    }
  }

  if (!me) return <Loading />;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-12 pb-10">
      <h1 className="text-2xl font-bold">개인정보 수집·이용 동의</h1>
      <p className="mt-2 text-gray-600">{me.participant.display_name} 님, 아래 내용을 확인한다.</p>

      <ul className="mt-6 space-y-3">
        {notices.map((n) => (
          <li key={n.title} className="rounded-xl border border-gray-200 p-3">
            <p className="text-sm font-semibold">{n.title}</p>
            <p className="mt-1 text-sm text-gray-700">{n.body}</p>
          </li>
        ))}
      </ul>

      <label className="mt-6 flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span className="text-sm">위 내용을 읽었고 개인정보 수집·이용에 동의한다.</span>
      </label>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button onClick={submit} disabled={!agree || busy} className="mt-6 w-full rounded-xl bg-black py-3 text-lg font-semibold text-white disabled:bg-gray-300">
        동의하고 계속
      </button>
      <p className="mt-4 text-xs text-gray-400">처리방침 전문은 홈의 사용설명서에서 볼 수 있다.</p>
    </main>
  );
}
