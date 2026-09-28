// 운영 콘솔 (담당: 성하). 보호와 틀은 layout.tsx(운영자만). 참가자 화면과 별개의 페이지이고 DB 만 같이 쓴다.
// 흐름: 계산 서비스가 초안을 만든다 → 운영자가 배정 버전에서 확인한다 → 공개한다(9/29 결정).
// 계산은 콘솔 버튼(서버가 COMPUTE_URL 을 부름) 또는 운영자 노트북의 curl 로 한다. 둘 다 결과는 초안이다.
import StatusPanel from "./StatusPanel";
import ComputePanel from "./ComputePanel";
import VersionsPanel from "./VersionsPanel";

export const dynamic = "force-dynamic";

export default function OpsPage() {
  return (
    <div className="space-y-6">
      <StatusPanel />
      <section className="space-y-3">
        <h2 className="text-base font-semibold">계산 서비스</h2>
        <ComputePanel />
      </section>
      <section>
        <h2 className="text-base font-semibold">배정 버전 확인과 공개</h2>
        <div className="mt-2">
          <VersionsPanel />
        </div>
      </section>
    </div>
  );
}
