// 교환한 명함 목록(피그마 iPhone 16 - 7). 어디서 만났나 칩으로 거른다(0013 card.met).
import SubHeader from "@/components/figma/SubHeader";
import { requireOnboarded } from "../_guard";
import CardShell from "../CardShell";
import WalletClient from "./WalletClient";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  await requireOnboarded("/card/wallet");
  return (
    <CardShell header={<SubHeader title="교환한 명함 목록" back="/card" />}>
      <WalletClient />
    </CardShell>
  );
}
