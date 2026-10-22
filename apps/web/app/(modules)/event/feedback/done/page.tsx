// 행사 후기 완료 화면(피그마 R-3). 스탬프를 받았다는 안내와 내가 남긴 후기 요약.
import EventShell from "../../EventShell";
import FeedbackDone from "./FeedbackDone";

export const dynamic = "force-dynamic";

export default function FeedbackDonePage() {
  return (
    <EventShell title="행사 후기">
      <FeedbackDone />
    </EventShell>
  );
}
