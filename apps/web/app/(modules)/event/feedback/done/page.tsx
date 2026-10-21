// ORBIT.app 피드백 완료 화면(피그마 R-3). 스탬프를 받았다는 안내와 내가 남긴 피드백 요약.
import EventShell from "../../EventShell";
import FeedbackDone from "./FeedbackDone";

export const dynamic = "force-dynamic";

export default function FeedbackDonePage() {
  return (
    <EventShell title="ORBIT.app 피드백">
      <FeedbackDone />
    </EventShell>
  );
}
