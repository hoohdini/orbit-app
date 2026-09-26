// 명함함. 내가 가진 명함 목록.
import { requireOnboarded } from "../_guard";
import WalletClient from "./WalletClient";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  await requireOnboarded("/card/wallet");
  return <WalletClient />;
}
