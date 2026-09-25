// 사람 한 명을 나타내는 칩. 이름과 소속만 보인다. 궤도, 테이블, 명함함이 같이 쓴다.
export type PersonLike = { id: string; display_name: string; affiliation?: string | null; role?: string; topic_tags?: string[] };

export default function PersonChip({ person, onClick, small }: { person: PersonLike; onClick?: () => void; small?: boolean }) {
  const cls = `inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white ${small ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"}`;
  const body = (
    <>
      <span className="font-medium">{person.display_name}</span>
      {person.affiliation && <span className="text-gray-500">{person.affiliation}</span>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <span className={cls}>{body}</span>
  );
}
