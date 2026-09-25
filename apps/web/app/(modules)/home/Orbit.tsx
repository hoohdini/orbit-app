// 나를 중심에 둔 궤도. 링1 = 앞 3자리 일치, 링2 = 앞 2자리, 링3 = 앞 1자리. SVG 위 균등 배치.
"use client";

import { useState } from "react";

export type OrbitPerson = { id: string; display_name: string; affiliation: string | null; role: string; topic_tags: string[]; sid_prefix: number[] };
export type OrbitData = {
  me: { sid: number[]; prefix: number[]; label: string | null } | null;
  rings: { match_len: number; total: number; people: OrbitPerson[] }[];
  hidden_count: number;
  checked_in_total: number;
};

const SIZE = 320;
const C = SIZE / 2;
const RADIUS: Record<number, number> = { 3: 58, 2: 98, 1: 138 };
const RING_TEXT: Record<number, string> = { 3: "앞 3자리 일치", 2: "앞 2자리 일치", 1: "앞 1자리 일치" };

function short(name: string) {
  return name.length > 5 ? name.slice(0, 5) : name;
}

export default function Orbit({ data, myName }: { data: OrbitData; myName: string }) {
  const [picked, setPicked] = useState<OrbitPerson | null>(null);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-sm font-semibold">내 궤도</span>
        <span className="text-xs text-gray-500">입장 {data.checked_in_total}명 · 15초마다 갱신</span>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mt-2 w-full" role="img" aria-label="내 궤도">
        {[1, 2, 3].map((m) => (
          <circle key={m} cx={C} cy={C} r={RADIUS[m]} fill="none" stroke="#e5e7eb" strokeDasharray={m === 1 ? "3 4" : undefined} />
        ))}
        {data.rings.map((ring) => {
          const n = ring.people.length;
          const r = RADIUS[ring.match_len];
          return ring.people.map((p, i) => {
            const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1) + ring.match_len * 0.4;
            const x = C + r * Math.cos(angle);
            const y = C + r * Math.sin(angle);
            const fill = ring.match_len === 3 ? "#111827" : ring.match_len === 2 ? "#6b7280" : "#d1d5db";
            return (
              <g key={p.id} onClick={() => setPicked(p)} className="cursor-pointer">
                <circle cx={x} cy={y} r={13} fill={fill} />
                <text x={x} y={y + 24} textAnchor="middle" fontSize="10" fill="#374151">
                  {short(p.display_name)}
                </text>
              </g>
            );
          });
        })}
        <circle cx={C} cy={C} r={20} fill="#000" />
        <text x={C} y={C + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="bold">
          {short(myName)}
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-gray-500">
        {data.rings.map((r) => (
          <span key={r.match_len}>
            {RING_TEXT[r.match_len]} {r.total}명
          </span>
        ))}
        {data.hidden_count > 0 && <span>+{data.hidden_count}명 더</span>}
      </div>
      {picked && (
        <div className="mt-3 rounded-xl bg-gray-50 p-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold">{picked.display_name}</p>
              <p className="text-sm text-gray-600">{picked.affiliation ?? "소속 없음"}</p>
            </div>
            <button onClick={() => setPicked(null)} className="text-sm text-gray-400">
              닫기
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">주소 앞자리 {picked.sid_prefix.join("-")} 일치</p>
          {picked.topic_tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {picked.topic_tags.map((t) => (
                <span key={t} className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-200">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
