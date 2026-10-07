"use client";
// 궤도(개발 지시서 v0.2 N-01 · N-05). 가운데 나, 안쪽에 같은 테이블(그룹) 사람을 나와 가까운 순서대로(가까울수록 안쪽).
// 점수 · 순위 숫자는 쓰지 않고 거리로만 나타낸다. 바깥 다른 테이블은 OrbitRoom 이 따로 그린다. 화면 요소는 나 포함 18개 이하(서버가 자른다).
type Person = { id: string; display_name: string };

const SIZE = 300;
const C = SIZE / 2;

export default function Orbit({ me, people }: { me: string; people: Person[] }) {
  const n = people.length;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block w-full max-w-xs" role="img" aria-label="내 테이블 궤도">
      <circle cx={C} cy={C} r={70} fill="none" stroke="#e5e7eb" strokeDasharray="3 4" />
      <circle cx={C} cy={C} r={120} fill="none" stroke="#e5e7eb" strokeDasharray="3 4" />
      {people.map((p, i) => {
        const r = 70 + (50 * i) / Math.max(1, n - 1);
        const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
        const x = C + r * Math.cos(a);
        const y = C + r * Math.sin(a);
        return (
          <g key={p.id}>
            <line x1={C} y1={C} x2={x} y2={y} stroke="#f3f4f6" />
            <circle cx={x} cy={y} r={7} fill="#111827" />
            <text x={x} y={y + 19} textAnchor="middle" fontSize="11" fill="#374151">
              {p.display_name}
            </text>
          </g>
        );
      })}
      <circle cx={C} cy={C} r={16} fill="#111827" />
      <text x={C} y={C + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="bold">
        {me}
      </text>
    </svg>
  );
}

type Table = { table_no: number; label: string | null; grid: { row: number; col: number } | null };

// 다른 테이블 · 그룹(바깥 궤도). 테이블토크는 실제 3×3 배치 위치대로, 커피챗은 가까운 그룹 8개를 번호 순으로. 개인 이름은 쓰지 않는다
export function OrbitRoom({ mine, others }: { mine: Table; others: Table[] }) {
  const all = [mine, ...others];
  if (all.every((t) => t.grid)) {
    const cell = new Map(all.map((t) => [`${t.grid!.row}-${t.grid!.col}`, t]));
    return (
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].flatMap((row) =>
          [0, 1, 2].map((col) => {
            const t = cell.get(`${row}-${col}`);
            const me = t?.table_no === mine.table_no;
            return (
              <div key={`${row}-${col}`} className={`flex h-16 flex-col items-center justify-center rounded-xl text-center ${me ? "bg-black text-white" : t ? "bg-gray-100 text-gray-700" : "bg-transparent"}`}>
                {t && (
                  <>
                    <span className="text-sm font-bold">{t.table_no}</span>
                    {t.label && <span className="mt-0.5 line-clamp-1 px-1 text-[10px] opacity-80">{t.label}</span>}
                  </>
                )}
              </div>
            );
          }),
        )}
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-4 gap-2">
      {others.map((t) => (
        <li key={t.table_no} className="flex h-14 flex-col items-center justify-center rounded-xl bg-gray-100 text-center text-gray-700">
          <span className="text-sm font-bold">{t.table_no}</span>
          {t.label && <span className="line-clamp-1 px-1 text-[10px]">{t.label}</span>}
        </li>
      ))}
    </ul>
  );
}
