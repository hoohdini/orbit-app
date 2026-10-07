// 운영 콘솔 (담당: 성하). 보호와 틀은 layout.tsx(운영자만). 참가자 화면과 별개의 페이지이고 DB 만 같이 쓴다.
// 흐름: 계산 서비스가 초안을 만든다 → 운영자가 배정 버전에서 확인한다 → 공개한다(9/29 결정).
// 계산은 콘솔 버튼(서버가 COMPUTE_URL 을 부름) 또는 운영자 노트북의 curl 로 한다. 둘 다 결과는 초안이다.
import PhasePanel from "./PhasePanel";
import StatusPanel from "./StatusPanel";
import CheckinPanel from "./CheckinPanel";
import ComputePanel from "./ComputePanel";
import VersionsPanel from "./VersionsPanel";
import LabelsPanel from "./LabelsPanel";
import PosterPanel from "./PosterPanel";
import MissionsPanel from "./MissionsPanel";
import AuditPanel from "./AuditPanel";

export const dynamic = "force-dynamic";

const NAV = [
  ["phase", "식순 · 공지"],
  ["status", "상태판"],
  ["checkin", "체크인"],
  ["compute", "계산"],
  ["versions", "배정 공개"],
  ["labels", "이름표"],
  ["missions", "미션 · 시상"],
  ["poster", "포스터 · 추첨"],
  ["audit", "감사 로그"],
] as const;

export default function OpsPage() {
  return (
    <div className="space-y-8">
      <nav className="flex flex-wrap gap-2 text-xs">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-gray-300 bg-white px-3 py-1 text-gray-700">
            {label}
          </a>
        ))}
      </nav>
      <div id="phase" className="scroll-mt-4">
        <PhasePanel />
      </div>
      <div id="status" className="space-y-6 scroll-mt-4">
        <StatusPanel />
      </div>
      <section id="checkin" className="scroll-mt-4">
        <h2 className="text-base font-semibold">체크인</h2>
        <p className="mt-0.5 mb-2 text-xs text-gray-500">첫 로그인이 곧 체크인이다. 폰이 안 되는 사람만 여기서 수동으로 한다</p>
        <CheckinPanel />
      </section>
      <section id="compute" className="space-y-3 scroll-mt-4">
        <h2 className="text-base font-semibold">계산 서비스</h2>
        <ComputePanel />
      </section>
      <section id="versions" className="scroll-mt-4">
        <h2 className="text-base font-semibold">배정 버전 확인과 공개</h2>
        <div className="mt-2">
          <VersionsPanel />
        </div>
      </section>
      <section id="labels" className="scroll-mt-4">
        <h2 className="text-base font-semibold">이름표</h2>
        <p className="mt-0.5 mb-2 text-xs text-gray-500">전날 계산이 단 초안을 행사 전에 고친다. 참가자에게는 주소 숫자 대신 이 이름표가 보인다</p>
        <LabelsPanel />
      </section>
      <section id="missions" className="scroll-mt-4">
        <h2 className="text-base font-semibold">미션 · 특별 시상</h2>
        <div className="mt-2">
          <MissionsPanel />
        </div>
      </section>
      <section id="poster" className="scroll-mt-4">
        <h2 className="text-base font-semibold">포스터세션과 추첨</h2>
        <div className="mt-2">
          <PosterPanel />
        </div>
      </section>
      <section id="audit" className="scroll-mt-4">
        <h2 className="text-base font-semibold">감사 로그</h2>
        <div className="mt-2">
          <AuditPanel />
        </div>
      </section>
    </div>
  );
}
