// 명함 모듈 (담당: 성하). /card 는 내 명함, /card?p=<id> 는 명찰 QR 을 내장 카메라로 찍었을 때 열리는 교환 결과다.
import { requireOnboarded } from "./_guard";
import MyCard from "./MyCard";
import ExchangeResult from "./ExchangeResult";

export const dynamic = "force-dynamic";

export default async function CardPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const next = p ? `/card?p=${encodeURIComponent(p)}` : "/card";
  await requireOnboarded(next);
  return p ? <ExchangeResult payload={p} /> : <MyCard />;
}
