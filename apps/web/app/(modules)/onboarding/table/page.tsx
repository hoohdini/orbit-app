// 좌석 안내(피그마 iPhone 16 - 6, v0.2 H-00). 동의 화면 다음. 내 테이블 · 좌석 번호와 명찰 착용 안내, Go 를 누르면 명함 탭(또는 next).
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type Me } from "@/lib/client";
import { safeNext, withNext } from "../_next";
import OnboardingFrame from "../_frame";

type Entry = Me & { table: (Me["table"] & { seat_no?: number | null }) | null };

export default function TablePage() {
  return (
    <Suspense fallback={null}>
      <Seat />
    </Suspense>
  );
}

function Seat() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [me, setMe] = useState<Entry | null>(null);

  useEffect(() => {
    api<Entry>("/api/onboarding/me").then((r) => {
      if (!r.ok) return router.replace(withNext("/onboarding", next));
      setMe(r.data);
    });
  }, [router, next]);

  const t = me?.table;
  return (
    <OnboardingFrame wave="seat" step={2} back={`${withNext("/onboarding/consent", next)}${next ? "&" : "?"}redo=1`} next={{ label: "Go", onClick: () => router.replace(next ?? "/card") }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/figma/seat-glow.svg" className="pointer-events-none absolute left-[-45px] top-[122px] h-[516px] w-[486px] max-w-none" />
      <div className="absolute inset-x-0 top-[302px] text-center font-medium text-white">
        {!me ? (
          <p className="pt-10 text-lg">불러오는 중</p>
        ) : t ? (
          <>
            <p className="leading-[81px]">
              <span className="text-[64px]">{t.table_no}</span>
              <span className="text-[40px]">번 테이블</span>
            </p>
            {t.seat_no ? (
              <p className="mt-[14px] leading-[61px]">
                <span className="text-[48px]">{t.seat_no}</span>
                <span className="text-[36px]">번 좌석</span>
              </p>
            ) : null}
          </>
        ) : (
          <p className="pt-6 text-2xl leading-9">
            자리 배정은
            <br />곧 공개돼요
          </p>
        )}
      </div>
      <p className="absolute inset-x-0 top-[639px] text-center text-base leading-[25px]">
        {t ? (
          <>
            명찰을 착용한 후
            <br />
            자리에 착석해주세요!
          </>
        ) : (
          <>
            명찰을 착용하고
            <br />
            안내를 기다려 주세요
          </>
        )}
      </p>
    </OnboardingFrame>
  );
}
