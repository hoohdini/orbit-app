// 포스터 세션 목록(피그마 P-0). 미션 ① ② 타일에서 온다.
import EventShell from "../EventShell";
import PosterList from "./PosterList";

export const dynamic = "force-dynamic";

export default function PostersPage() {
  return (
    <EventShell title="포스터 세션">
      <PosterList />
    </EventShell>
  );
}
