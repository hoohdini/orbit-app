// 행사 후기 입력 화면(피그마 R-1 비어 있음 · R-2 작성 중). 만족도 3단계, 좋았던 점 칩, 한마디, 제출.
import EventShell from "../EventShell";
import FeedbackForm from "./FeedbackForm";

export const dynamic = "force-dynamic";

export default function FeedbackPage() {
  return (
    <EventShell title="행사 후기">
      <FeedbackForm />
    </EventShell>
  );
}
