// 온보딩 진입 화면 (담당: 성하). 공용 입장 QR 이 이 주소를 가리킨다(피그마 iPhone 16 - 9 시작 화면 → 16 - 4 로그인).
// 이름과 숫자 4자리를 입력하면 바로 로그인된다. 동명이인이면 소속 선택이 아래에 펼쳐진다.
// 명함 · 포스터 QR 로 들어온 사람(next)은 시작 화면을 건너뛴다.
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { useFit } from "@/components/figma/useFit";
import { safeNext, withNext } from "./_next";
import OnboardingFrame from "./_frame";

type Candidate = { id: string; display_name: string; affiliation: string | null; role: string; cohort: number | null };
type LoginData = { participant?: { id: string; display_name: string }; consented?: boolean; choose?: Candidate[] };

const roleLabel: Record<string, string> = { student: "재학생", alumni: "졸업생", professor: "교수", staff: "운영진", other: "기타" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <Entry />
    </Suspense>
  );
}

function Entry() {
  const next = safeNext(useSearchParams().get("next"));
  const [started, setStarted] = useState(next !== null);
  return started ? <LoginForm next={next} /> : <Splash onStart={() => setStarted(true)} />;
}

// 시작 화면(피그마 iPhone 16 - 9). 장식은 폭에 맞춰 비율로, 시작하기는 화면 아래 큰 버튼(10/11)
function Splash({ onStart }: { onStart: () => void }) {
  const [ref, s] = useFit<HTMLDivElement>(393, 1.15);
  return (
    <div className="flex min-h-dvh justify-center overflow-clip bg-gradient-to-b from-navy to-navy-2 text-white">
      <div ref={ref} className="flex w-full max-w-md flex-col">
        <div className="relative w-full shrink-0" style={{ height: 660 * s }}>
          <div className="absolute left-1/2 top-0 h-[660px] w-[393px] origin-top" style={{ transform: `translateX(-50%) scale(${s})` }}>
            <h1 className="absolute inset-x-0 top-[100px] text-center text-[32px] font-semibold leading-[39px]">
              2026
              <br />
              DSL Gathering Night
              <br />: The ORBIT
            </h1>
            <p className="absolute inset-x-0 top-[260px] text-center text-base">
              연세대학교 백양누리
              <br />B110 최영홀 &amp; B111 김순전홀
              <br />
              2026. 10. 31. 15:00
            </p>
            {/* eslint-disable @next/next/no-img-element */}
            <img alt="" src="/figma/splash-line1.svg" className="pointer-events-none absolute left-[31px] top-[474px] h-[57px] w-[334px] max-w-none -rotate-[44.08deg]" />
            <img alt="" src="/figma/splash-line2.svg" className="pointer-events-none absolute left-[38px] top-[483px] h-[38px] w-[315px] max-w-none -rotate-[44.37deg]" />
            <img alt="" src="/figma/splash-ring.svg" className="absolute left-[84px] top-[388.5px] size-[228px] max-w-none" />
            <img alt="" src="/figma/splash-disc.svg" className="absolute left-[110px] top-[418.5px] size-[176px] max-w-none" />
            {/* eslint-enable @next/next/no-img-element */}
          </div>
        </div>
        <div className="flex-1" />
        <div className="px-6 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          <p className="mb-4 text-center text-[13px]">The ORBIT에 오신 것을 환영합니다</p>
          <button type="button" onClick={onStart} className="h-14 w-full rounded-2xl bg-white text-base font-bold text-navy">
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
}

// 로그인(피그마 iPhone 16 - 4, 오류는 16 - 11)
function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choose, setChoose] = useState<Candidate[] | null>(null);

  async function submit(participantId?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await api<LoginData>("/api/onboarding/login", { json: { display_name: name.trim(), pin, participant_id: participantId } });
    setBusy(false);
    if (!r.ok) {
      setChoose(null);
      setError(r.status === 423 ? "여러 번 틀려서 잠시 잠겼어요. 10분 뒤에 다시 시도해 주세요." : r.status === 401 ? "이름 혹은 숫자 4자리가 일치하지 않습니다. 다시 한 번 확인해 주세요." : r.message);
      return;
    }
    if (r.data.choose) {
      setChoose(r.data.choose);
      return;
    }
    // 명함 · 포스터 QR 로 들어온 사람(next)은 로그인 뒤 제자리로. 첫 로그인이면 동의 → 좌석 안내를 거치되 next 를 이어 준다
    router.replace(r.data.consented ? (next ?? "/card") : withNext("/onboarding/consent", next));
  }

  const canSubmit = name.trim().length >= 1 && /^\d{4}$/.test(pin) && !busy;
  // 입력 글자는 16px(iOS 가 입력할 때 화면을 확대하지 않게)
  const field = "h-[60px] w-full rounded-xl bg-field px-[15px] text-base text-ink shadow-[0_4px_4px_rgba(0,0,0,0.25)] outline-none placeholder:text-[#6c6c6c] focus:ring-1 focus:ring-navy";

  return (
    <OnboardingFrame
      wave="login"
      step={0}
      stageH={300}
      stage={
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src="/figma/dsl-logo-white.svg" className="absolute left-[81px] top-[123px] h-[139px] w-[243px]" />
          <p className="absolute inset-x-0 top-[181px] text-center text-2xl font-medium text-white">로그인</p>
        </>
      }
      next={{ label: busy ? "확인 중" : "입장하기", type: "submit", form: "login", disabled: !canSubmit }}
    >
      <form
        id="login"
        className="mx-auto flex w-full max-w-[300px] flex-col gap-[15px] pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) submit();
        }}
      >
        <input
          className={field}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setChoose(null);
          }}
          autoComplete="name"
          maxLength={20}
          placeholder="이름"
          aria-label="이름"
        />
        <input
          className={`${field} tracking-wider`}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
            setChoose(null);
          }}
          inputMode="numeric"
          pattern="\d*"
          autoComplete="one-time-code"
          placeholder="숫자 4자리"
          aria-label="숫자 4자리"
        />
        {error && (
          <p role="alert" className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-[#f2b8b5] bg-white px-4 py-3 text-center text-[13px] text-[#c5221f] shadow-[0_2px_4px_rgba(0,0,0,0.12)]">
            <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded-full border border-[#c5221f] text-[10px] font-bold">!</span>
            {error}
          </p>
        )}
        {choose && (
          <div className="mt-2 rounded-xl border border-navy bg-white p-3">
            <p className="text-sm text-ink-2">같은 이름이 여러 명이에요. 본인을 골라 주세요</p>
            <ul className="mt-2 space-y-2">
              {choose.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => submit(c.id)} className="min-h-12 w-full rounded-lg border border-navy px-3 py-2 text-left text-sm">
                    <span className="font-bold">{c.display_name}</span>
                    <span className="ml-2 text-ink-2">
                      {c.affiliation ?? "소속 없음"} · {roleLabel[c.role] ?? c.role}
                      {c.cohort ? ` · ${c.cohort}기` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3 text-center text-xs leading-relaxed text-ink-3">숫자 4자리는 보통 휴대폰 번호 뒤 4자리예요. 기억나지 않으면 등록 데스크의 운영진에게 말씀해 주세요</p>
      </form>
    </OnboardingFrame>
  );
}
