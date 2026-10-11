// 명함 상세보기(피그마 iPhone 16 - 8). 라벨형 명함, seek · offer, 함께 있던 자리, 연락처, 메모.
import SubHeader from "@/components/figma/SubHeader";
import { requireOnboarded } from "../../_guard";
import CardShell from "../../CardShell";
import CardDetail from "./CardDetail";

export const dynamic = "force-dynamic";

export default async function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOnboarded(`/card/wallet/${id}`);
  return (
    <CardShell header={<SubHeader title="명함 상세보기" back="/card/wallet" />}>
      <CardDetail id={id} />
    </CardShell>
  );
}
