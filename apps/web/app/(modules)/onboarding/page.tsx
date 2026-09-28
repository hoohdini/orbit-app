// 온보딩 진입 화면 (담당: 성하). 공용 입장 QR 이 이 주소를 가리킨다.
// 이름과 숫자 4자리를 입력하면 바로 로그인된다. 동명이인이면 소속 선택이 아래에 펼쳐진다.
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { safeNext, withNext } from "./_next";

type Candidate = { id: string; display_name: string; affiliation: string | null; role: string; cohort: number | null };
type LoginData = { participant?: { id: string; display_name: string }; consented?: boolean; choose?: Candidate[] };

const roleLabel: Record<string, string> = { student: "재학생", alumni: "졸업생", professor: "교수", staff: "운영진", other: "기타" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingForm />
    </Suspense>
  );
}

function OnboardingForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
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
      setError(r.status === 423 ? "여러 번 틀려서 잠시 잠겼다. 10분 뒤에 다시 시도한다" : r.message);
      return;
    }
    if (r.data.choose) {
      setChoose(r.data.choose);
      return;
    }
    // 명함 · 포스터 QR 로 들어온 사람(next)은 로그인 뒤 제자리로. 첫 로그인이면 동의 화면을 거치되 next 를 이어 준다
    router.replace(r.data.consented ? (next ?? "/onboarding/table") : withNext("/onboarding/consent", next));
  }

  const canSubmit = name.trim().length >= 1 && /^\d{4}$/.test(pin) && !busy;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-16 pb-10">
      <p className="text-sm text-gray-500">2026 DSL Gathering</p>
      <h1 className="mt-1 text-3xl font-bold">The ORBIT</h1>
      <p className="mt-3 text-gray-600">사전 등록한 이름과 숫자 4자리(휴대폰 번호 뒤 4자리)를 입력한다.</p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className="text-sm font-medium">이름</span>
          <input
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-lg outline-none focus:border-black"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setChoose(null);
            }}
            autoComplete="name"
            maxLength={20}
            placeholder="홍길동"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">숫자 4자리</span>
          <input
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 font-mono text-2xl tracking-[0.5em] outline-none focus:border-black"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              setChoose(null);
            }}
            inputMode="numeric"
            pattern="\d*"
            autoComplete="one-time-code"
            placeholder="0000"
          />
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {choose && (
          <div className="rounded-xl border border-gray-200 p-3">
            <p className="text-sm text-gray-600">같은 이름이 여러 명이다. 본인을 고른다.</p>
            <ul className="mt-2 space-y-2">
              {choose.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => submit(c.id)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left hover:border-black">
                    <span className="font-medium">{c.display_name}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      {c.affiliation ?? "소속 없음"} · {roleLabel[c.role] ?? c.role}
                      {c.cohort ? ` · ${c.cohort}기` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button type="submit" disabled={!canSubmit} className="w-full rounded-xl bg-black py-3 text-lg font-semibold text-white disabled:bg-gray-300">
          {busy ? "확인 중" : "입장"}
        </button>
      </form>

      <p className="mt-6 text-xs text-gray-400">이름이나 숫자가 기억나지 않으면 등록 데스크의 운영진에게 말한다.</p>
    </main>
  );
}
