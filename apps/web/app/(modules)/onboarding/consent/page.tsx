// 개인정보 이용 동의(피그마 iPhone 16 - 5, 개발 지시서 v0.2 H-00). 로그인 직후 한 번. 동의 · 동의하지 않음 중 하나를 고르고 Next.
// 동의하지 않아도 시작할 수 있다(10/5 회의): 자리는 사전 등록 정보로 이미 배정돼 있고, 행사 중 기록(명함 교환, 만족도, 포스터 응답)만 하지 않는다.
// 다음은 좌석 안내(/onboarding/table). 이미 골랐으면 건너뛴다(?redo=1 이면 다시 고른다). 마이페이지에서도 바꿀 수 있다.
// 피그마 메모의 카메라 사용 동의는 브라우저가 QR 을 찍을 때 따로 묻기 때문에 저장하지 않고 안내만 한다(10/11 검토).
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type Me } from "@/lib/client";
import { safeNext, withNext } from "../_next";
import OnboardingFrame from "../_frame";

type Entry = Me & { consent?: "agreed" | "refused" | "pending" };

const notices = [
  { title: "수집·이용 목적", body: "행사 참가자 간 네트워킹(테이블 배정, 명함 교환, 추천, 미션 운영)" },
  { title: "수집 항목", body: "사전 등록 정보(이름, 소속, 구분, 기수, 관심 태그, 하는 일 · 찾는 사람), 행사 중 앱 사용 기록(명함 교환, 만족도, 포스터 응답)" },
  { title: "보유 기간", body: "행사 종료 후 30일까지. 이후 즉시 파기" },
  { title: "거부할 권리", body: "동의하지 않아도 자리 안내와 식순은 볼 수 있어요. 다만 명함 교환, 추천, 미션은 쓸 수 없어요" },
  { title: "카메라", body: "QR을 찍을 때 브라우저가 카메라 권한을 따로 물어봐요. 영상은 저장하지 않아요" },
];

export default function ConsentPage() {
  return (
    <Suspense fallback={null}>
      <ConsentForm />
    </Suspense>
  );
}

function ConsentForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const redo = params.get("redo") === "1";
  const after = withNext("/onboarding/table", next);
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Entry>("/api/onboarding/me").then((r) => {
      if (!r.ok) return router.replace(withNext("/onboarding", next));
      if (!redo && r.data.consent && r.data.consent !== "pending") return router.replace(after);
      if (r.data.consent === "agreed") setChoice(true);
      if (r.data.consent === "refused") setChoice(false);
      setReady(true);
    });
  }, [router, after, next, redo]);

  async function submit() {
    if (choice === null) return;
    setBusy(true);
    setError(null);
    const r = await api("/api/onboarding/consent", { json: { agreed: choice } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.replace(after);
  }

  return (
    <OnboardingFrame wave="consent" step={1} back={withNext("/onboarding", next)} next={{ label: busy ? "저장 중" : "Next", onClick: submit, disabled: choice === null || busy || !ready }}>
      <h1 className="absolute inset-x-0 top-[169px] text-center text-2xl font-medium text-white">개인정보 이용 동의</h1>
      <section className="absolute left-[59px] top-[225px] h-[320px] w-[278px] overflow-y-auto rounded-xl bg-field p-4 shadow-[0_4px_4px_rgba(0,0,0,0.25)]">
        <ul className="space-y-3">
          {notices.map((n) => (
            <li key={n.title}>
              <p className="text-[13px] font-bold text-ink">{n.title}</p>
              <p className="mt-0.5 text-xs leading-[18px] text-ink-2">{n.body}</p>
            </li>
          ))}
        </ul>
      </section>
      <fieldset className="absolute left-[111px] top-[575px] space-y-5">
        <legend className="sr-only">이용 동의</legend>
        {[
          { v: true, label: "동의합니다." },
          { v: false, label: "동의하지 않습니다." },
        ].map((o) => (
          <label key={String(o.v)} className="flex cursor-pointer items-center gap-[15px] text-base">
            <input type="radio" name="consent" className="peer sr-only" checked={choice === o.v} onChange={() => setChoice(o.v)} />
            <span className="flex size-[23px] items-center justify-center rounded-full bg-line peer-checked:bg-navy peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
              {choice === o.v && <span className="size-[9px] rounded-full bg-white" />}
            </span>
            {o.label}
          </label>
        ))}
      </fieldset>
      {error && <p className="absolute inset-x-6 top-[690px] text-center text-sm text-[#d93025]">{error}</p>}
    </OnboardingFrame>
  );
}
