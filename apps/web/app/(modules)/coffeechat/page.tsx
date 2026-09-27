// 커피챗 (담당: 민찬). 커피챗 테이블 · 대화거리 · 같은 테이블 사람 · 찾아가 볼 만한 사람(추천).
// 운영진이 공개하기 전이면 30초마다 다시 확인한다. 테이블토크와는 독립된 페이지다(합칠지는 다음 회의에서).
// 주소(SID) 숫자는 보여 주지 않는다(9/27 회의).
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";

const POLL_MS = 30_000;

type Member = { id: string; display_name: string; affiliation: string | null; topic_tags: string[]; offer_text: string };
type Table = { table_no: number; label: string | null; talk_prompts: string[]; members: Member[] };
type Rec = {
  rank: number;
  target: { id: string; display_name: string; affiliation: string | null };
  current_table_no: number | null;
  reason: { common_topics?: string[]; they_can_give?: string[]; same_orbit?: boolean } | null;
};

export default function CoffeechatPage() {
  const [table, setTable] = useState<Table | null | undefined>(undefined); // undefined 는 불러오는 중, null 은 미공개
  const [recs, setRecs] = useState<Rec[]>([]);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    api<{ participant: { id: string } }>("/api/onboarding/me").then((r) => alive && r.ok && setMeId(r.data.participant.id));
    async function load() {
      const t = await api<Table>("/api/coffeechat/table");
      if (!alive) return;
      if (!t.ok) {
        setTable(null);
        timer = setTimeout(load, POLL_MS);
        return;
      }
      setTable(t.data);
      const r = await api<{ recs: Rec[] }>("/api/coffeechat/recs");
      if (alive && r.ok) setRecs(r.data.recs);
    }
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (table === undefined) return <Loading />;

  return (
    <>
      <TopBar title="커피챗" />
      <main className="space-y-4 p-4">
        {!table ? (
          <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            커피챗 배정은 포스터세션 뒤에 공개된다. 공개되면 이 화면에 저절로 뜬다
          </p>
        ) : (
          <>
            <section className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">커피챗 테이블</h2>
                <span className="text-xs text-gray-500">{table.members.length}명</span>
              </div>
              <p className="mt-1 text-3xl font-bold">{table.table_no}번</p>
              <ul className="mt-3 divide-y divide-gray-100">
                {table.members.map((m) => (
                  <li key={m.id} className="py-2">
                    <p className="text-sm">
                      <span className="font-medium">{m.display_name}</span>
                      {m.id === meId && <span className="ml-1 rounded bg-gray-900 px-1 text-[10px] text-white">나</span>}
                      {m.affiliation && <span className="ml-2 text-gray-500">{m.affiliation}</span>}
                    </p>
                    {m.offer_text && <p className="mt-0.5 whitespace-pre-line text-xs text-gray-600">{m.offer_text}</p>}
                  </li>
                ))}
              </ul>
            </section>

            {table.talk_prompts.length > 0 && (
              <section className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold">대화거리</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {table.talk_prompts.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </section>
            )}

            {recs.length > 0 && (
              <section className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold">찾아가 볼 만한 사람</h2>
                <p className="mt-0.5 text-xs text-gray-500">테이블토크에서 아직 못 만난 사람 중에서 골랐다</p>
                <ol className="mt-2 divide-y divide-gray-100">
                  {recs.map((r) => (
                    <li key={r.target.id} className="flex items-start gap-3 py-2">
                      <span className="w-5 pt-0.5 text-right text-xs text-gray-400">{r.rank}</span>
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-medium">{r.target.display_name}</span>
                          {r.target.affiliation && <span className="ml-2 text-gray-500">{r.target.affiliation}</span>}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-1">
                          {reasonChips(r.reason).map((c) => (
                            <span key={c} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                              {c}
                            </span>
                          ))}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-gray-500">{r.current_table_no != null ? `${r.current_table_no}번 테이블` : ""}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

function reasonChips(r: Rec["reason"]): string[] {
  if (!r) return [];
  const out: string[] = [];
  if (r.common_topics?.length) out.push(`같은 관심: ${r.common_topics.join(", ")}`);
  if (r.they_can_give?.length) out.push(`도움 받을 수 있음: ${r.they_can_give.join(", ")}`);
  if (r.same_orbit) out.push("비슷한 분야");
  return out;
}
