// 이벤트·미션 탭 첫 화면(피그마 E-01). 화면은 MissionBoard.
import EventShell from "./EventShell";
import MissionBoard from "./MissionBoard";

export const dynamic = "force-dynamic";

export default function EventPage() {
  return (
    <EventShell>
      <MissionBoard />
    </EventShell>
  );
}
