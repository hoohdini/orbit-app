// 명함 모듈 (담당: 성하). /card 는 명함 탭 첫 화면, /card?p=<id> 는 명찰 QR 을 내장 카메라로 찍었을 때 열리는 교환 결과다.
import Eclipse from "@/components/figma/Eclipse";
import { requireOnboarded } from "./_guard";
import CardShell from "./CardShell";
import DarkScreen from "./DarkScreen";
import MyCard from "./MyCard";
import ExchangeResult from "./ExchangeResult";

export const dynamic = "force-dynamic";

export default async function CardPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const next = p ? `/card?p=${encodeURIComponent(p)}` : "/card";
  await requireOnboarded(next);
  if (p) {
    return (
      <DarkScreen title="명함 교환" close="/card">
        <Eclipse guide={false} />
        <div className="mt-[18px] w-[353px]">
          <ExchangeResult payload={p} />
        </div>
      </DarkScreen>
    );
  }
  return (
    <CardShell>
      <MyCard />
    </CardShell>
  );
}
