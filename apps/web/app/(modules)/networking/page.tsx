// 네트워킹 탭. 화면은 NetworkingClient(브라우저에서 상태 API 를 보고 테이블토크 · 커피챗을 고른다).
import NetworkingClient from "./NetworkingClient";

export const dynamic = "force-dynamic";

export default function NetworkingPage() {
  return <NetworkingClient />;
}
