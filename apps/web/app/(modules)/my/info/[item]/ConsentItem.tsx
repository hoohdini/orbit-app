"use client";
// 동의 항목 하나(0014). 고르면 바로 저장한다(/api/onboarding/consent { agreed, item }). 거부해도 자리 안내와 식순은 볼 수 있다
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import { refreshOrbitState } from "@/components/useOrbitState";
import { toast } from "@/components/Toast";

type Item = "collect" | "share";
type Me = { consents?: Record<Item, { state: "agreed" | "refused" | "pending" }> };

const BODY: Record<Item, string[]> = {
  collect: [
    "수집·이용 목적: 행사 참가자 간 네트워킹(테이블 배정, 명함 교환, 추천, 미션 운영)",
    "수집 항목: 사전 등록 정보(이름, 소속, 구분, 기수, 관심 태그, 하는 일 · 찾는 사람), 행사 중 앱 사용 기록(명함 교환, 만족도, 포스터 응답, 퀴즈)",
    "보유 기간: 행사 종료 후 3개월까지. 이후 즉시 파기",
    "동의하지 않으면: 자리 안내와 식순은 볼 수 있지만 명함 교환, 포스터 응답, 미션 기록은 남지 않습니다",
  ],
  share: [
    "목적: 내 명함을 다른 참가자와 주고받고, 다른 분의 오늘 만나면 좋을 분 · 궤도 · 이름 검색에 나를 보여 주기",
    "보이는 항목: 이름, 소속, 구분, 기수, 하는 일 · 찾는 사람, 관심 태그, 공개 범위 안의 연락처",
    "보유 기간: 행사 종료 후 3개월까지. 이후 즉시 파기",
    "동의하지 않으면: 다른 분의 추천 · 궤도 · 이름 검색에 나오지 않고 명함을 주고받을 수 없습니다",
  ],
};

export default function ConsentItem({ item }: { item: Item }) {
  const [state, setState] = useState<"agreed" | "refused" | "pending" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/api/onboarding/me").then((r) => r.ok && r.data.consents && setState(r.data.consents[item].state));
  }, [item]);

  if (!state) return <Loading />;

  async function choose(agreed: boolean) {
    setBusy(true);
    setMsg(null);
    const r = await api("/api/onboarding/consent", { json: { agreed, item } });
    setBusy(false);
    if (!r.ok) {
      toast(r.message, "error");
      return setMsg(r.message);
    }
    setState(agreed ? "agreed" : "refused");
    setMsg("저장했습니다");
    toast(agreed ? "동의를 저장했습니다" : "동의 철회를 저장했습니다");
    refreshOrbitState();
  }

  return (
    <main className="space-y-5 px-5 py-7">
      <section className="min-h-[420px] space-y-3 rounded-2xl border border-navy px-5 py-5">
        {BODY[item].map((t) => (
          <p key={t} className="text-sm leading-relaxed text-ink">
            {t}
          </p>
        ))}
      </section>
      <div className="flex gap-7">
        {(
          [
            [true, "동의함"],
            [false, "동의하지 않음"],
          ] as const
        ).map(([v, label]) => {
          const on = (v && state === "agreed") || (!v && state === "refused");
          return (
            <button key={label} type="button" disabled={busy} onClick={() => choose(v)} aria-pressed={on} className="flex items-center gap-2.5 text-base text-ink">
              <span className={`flex size-[22px] items-center justify-center rounded-md border-[1.5px] ${on ? "border-brand bg-brand text-white" : "border-navy bg-white"}`}>{on && "✓"}</span>
              {label}
            </button>
          );
        })}
      </div>
      {msg && <p className="text-sm text-ink-2">{msg}</p>}
    </main>
  );
}
