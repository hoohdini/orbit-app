"use client";
// 내 정보(피그마 10/11). 동의 두 항목(0014: 개인정보 수집 및 이용 · 명함 공개 및 추천 활용)의 날짜와 상태, 사용설명서, 로그아웃.
// 피그마의 저장하기 버튼은 이 화면에 바꿀 값이 없어서 두지 않았다(동의는 각 항목 화면에서 바로 저장)
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import { Row, RowGroup, Section, ghostBtn } from "../ui";

type C = { state: "agreed" | "refused" | "pending"; at: string | null };
type Me = { consents?: { collect: C; share: C } };

const STATE = { agreed: "동의함", refused: "동의하지 않음", pending: "선택 전" } as const;
function day(c: C): string {
  if (!c.at) return "아직 고르지 않았습니다";
  const d = new Date(c.at);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${c.state === "agreed" ? "동의" : "거부"}`;
}

export default function Info() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/api/onboarding/me").then((r) => r.ok && setMe(r.data));
  }, []);
  if (!me?.consents) return <Loading />;
  const { collect, share } = me.consents;
  return (
    <main className="space-y-6 px-5 py-7">
      <Section title="개인정보 동의">
        <RowGroup>
          <Row href="/my/info/collect" title="개인정보 수집 및 이용" sub={day(collect)} trail={STATE[collect.state]} />
          <Row href="/my/info/share" title="명함 공개 및 추천 활용" sub={day(share)} trail={STATE[share.state]} />
        </RowGroup>
      </Section>
      <Section title="도움말">
        <RowGroup>
          <Row href="/my/guide" title="사용설명서" sub="서비스 이용 방법 보기" />
        </RowGroup>
      </Section>
      <a href="/logout" className={ghostBtn}>
        로그아웃
      </a>
    </main>
  );
}
