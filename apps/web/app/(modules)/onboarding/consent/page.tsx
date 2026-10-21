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
  { title: "보유 기간", body: "행사 종료 후 3개월까지. 이후 즉시 파기" }, // 구글폼 안내와 같게(10/21 민찬 결정)
  { title: "거부할 권리", body: "동의하지 않아도 자리 안내와 식순은 볼 수 있습니다. 다만 명함 교환, 추천, 미션은 쓸 수 없습니다" },
  { title: "명함 공개 및 추천 활용", body: "내 명함을 주고받고, 다른 분의 추천 · 궤도 · 이름 검색에 나를 보여 줍니다. 동의하지 않으면 명함 교환과 추천에서 빠집니다" },
  { title: "카메라", body: "QR을 찍을 때 브라우저가 카메라 권한을 따로 물어봅니다. 영상은 저장하지 않습니다" },
  { title: "두 항목 함께", body: "동의합니다를 고르면 개인정보 수집 및 이용, 명함 공개 및 추천 활용에 모두 동의합니다. 마이페이지 내 정보에서 항목별로 바꿀 수 있습니다" },
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
    <OnboardingFrame
      wave="consent"
      step={1}
      stageH={215}
      stage={<h1 className="absolute inset-x-0 top-[160px] text-center text-2xl font-medium text-white">개인정보 이용 동의</h1>}
      back={withNext("/onboarding", next)}
      next={{ label: busy ? "저장 중" : "다음", onClick: submit, disabled: choice === null || busy || !ready }}
    >
      <section className="mx-auto h-[min(320px,42dvh)] w-full max-w-[320px] overflow-y-auto rounded-xl bg-field p-4 shadow-[0_4px_4px_rgba(0,0,0,0.25)]">
        <ul className="space-y-3">
          {notices.map((n) => (
            <li key={n.title}>
              <p className="text-[13px] font-bold text-ink">{n.title}</p>
              <p className="mt-0.5 text-[13px] leading-[19px] text-ink-2">{n.body}</p>
            </li>
          ))}
        </ul>
      </section>
      <fieldset className="mx-auto mt-6 w-full max-w-[320px] space-y-1">
        <legend className="sr-only">이용 동의</legend>
        {[
          { v: true, label: "동의합니다." },
          { v: false, label: "동의하지 않습니다." },
        ].map((o) => (
          <label key={String(o.v)} className="flex min-h-11 cursor-pointer items-center gap-[15px] px-2 text-base">
            <input type="radio" name="consent" className="peer sr-only" checked={choice === o.v} onChange={() => setChoice(o.v)} />
            <span className="flex size-[23px] items-center justify-center rounded-full border border-[#a6abb3] bg-white peer-checked:border-navy peer-checked:bg-navy peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
              {choice === o.v && <span className="size-[9px] rounded-full bg-white" />}
            </span>
            {o.label}
          </label>
        ))}
      </fieldset>
      {error && <p className="mt-3 text-center text-sm text-[#c5221f]">{error}</p>}
    </OnboardingFrame>
  );
}
