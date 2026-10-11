"use client";
// 궤도(개발 지시서 v0.2 N-01 · N-05, 피그마 Orbit 컴포넌트). 가운데 나, 점선 원 안쪽에 같은 테이블(그룹) 사람을 나와 가까운 순서대로(가까울수록 안쪽).
// 바깥 8칸에 다른 테이블(T) · 그룹(G)의 대표 라벨만 둔다. 점수 · 순위 숫자는 쓰지 않는다. 화면 요소는 나 포함 18개 이하(서버가 자른다).
// 바깥 칸은 실제 3×3 배치 순서(행 → 열)대로 채운다. 내 테이블이 가운데 칸이 아니어도 나는 늘 가운데에 그린다.
type Person = { id: string; display_name: string };
type Table = { table_no: number; label: string | null; grid: { row: number; col: number } | null };

const W = 353;
const H = 340;
const CX = 176.5;
const CY = 170;
// 피그마 Table 1 ~ 9 칸 위치(가운데 칸 제외). 칸 폭 76
const SLOTS = [
  [7, 23], [137.5, 23], [268, 23],
  [7, 163], [268, 163],
  [7, 291], [137.5, 291], [268, 291],
] as const;

export default function Orbit({ people, others, round }: { people: Person[]; others: Table[]; round: "tabletalk" | "coffeechat" }) {
  const n = people.length;
  const outer = [...others]
    .sort((a, b) => (a.grid && b.grid ? a.grid.row - b.grid.row || a.grid.col - b.grid.col : a.table_no - b.table_no))
    .slice(0, SLOTS.length);
  const prefix = round === "tabletalk" ? "T" : "G";
  return (
    <div className="relative mx-auto h-[340px] w-full max-w-[353px] overflow-hidden rounded-3xl border border-navy bg-white" role="img" aria-label="나의 궤도">
      <svg width={W} height={H} className="absolute left-1/2 top-0 -translate-x-1/2" aria-hidden>
        {[50, 75, 100].map((r) => (
          <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="#c9d2e6" strokeDasharray="3 4" />
        ))}
      </svg>
      <div className="absolute left-1/2 top-0 h-[340px] w-[353px] -translate-x-1/2">
        {outer.map((t, i) => (
          <div key={t.table_no} className="absolute w-[76px] text-center" style={{ left: SLOTS[i][0], top: SLOTS[i][1] }}>
            <span className="mx-auto block size-3 rounded-full border-[1.5px] border-accent bg-white" />
            <p className="mt-0.5 text-[10px] text-ink-3">
              {prefix}
              {t.table_no}
            </p>
            {t.label && <p className="truncate px-1 text-[11px] text-navy">{t.label}</p>}
          </div>
        ))}
        {people.map((p, i) => {
          const r = 58 + (40 * i) / Math.max(1, n - 1);
          const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n) + 0.35;
          const x = CX + r * Math.cos(a);
          const y = CY + r * Math.sin(a);
          return (
            <div key={p.id} className="absolute w-[60px] text-center" style={{ left: x - 30, top: y - 15 }}>
              <span className="mx-auto flex size-[30px] items-center justify-center rounded-full border border-navy bg-white text-xs font-medium text-navy">{p.display_name.slice(0, 1)}</span>
              <p className="mt-[3px] truncate text-[10px] text-ink">{p.display_name}</p>
            </div>
          );
        })}
        <span className="absolute flex size-[52px] items-center justify-center rounded-full bg-navy text-base font-bold text-white" style={{ left: CX - 26, top: CY - 26 }}>
          나
        </span>
      </div>
    </div>
  );
}
