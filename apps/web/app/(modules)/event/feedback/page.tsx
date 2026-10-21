// ORBIT.app 피드백 입력 화면(피그마 R-1 비어 있음 · R-2 작성 중). 별점 5단계, 좋았던 점 칩, 한마디, 제출.
import EventShell from "../EventShell";
import FeedbackForm from "./FeedbackForm";

export const dynamic = "force-dynamic";

export default function FeedbackPage() {
  return (
    <EventShell title="ORBIT.app 피드백">
      <FeedbackForm />
    </EventShell>
  );
}
