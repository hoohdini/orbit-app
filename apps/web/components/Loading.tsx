// 화면 전체 로딩 자리. 10/21 부터 빙글 도는 원 대신 목록 모양 스켈레톤을 보여 준다(할 일 99). 문구는 화면 읽기용으로만 남긴다
import { SkeletonRows } from "./Skeleton";

export default function Loading({ text = "불러오는 중" }: { text?: string }) {
  return (
    <div className="px-5 py-7">
      <SkeletonRows rows={4} label={text} />
    </div>
  );
}
