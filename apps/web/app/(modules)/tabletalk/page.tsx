// 테이블토크 · 커피챗 한 페이지 (담당: 민찬). 9/27 회의 결정.
// 커피챗 배정이 공개되기 전에는 테이블토크 자리 · 동석자 · 만족도만 보인다.
// 공개되면 맨 위에 커피챗 자리 · 대화거리 · 추천이 뜨고 테이블토크는 아래로 내려간다. 30초마다 다시 확인한다.
// 주소(SID) 숫자는 보여 주지 않는다(9/27 회의).
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";
import { SATISFACTION_CHOICES, type SatisfactionChoice } from "@/app/api/tabletalk/_choices";

const POLL_MS = 30_000;
const SAT_KEY = "orbit:tabletalk-satisfaction";

type Member = { id: string; display_name: string; affiliation: string | null; topic_tags: string[]; offer_text: string };
type Table = { table_no: number; label: string | null; talk_prompts?: string[]; members: Member[] };
type Rec = {
  rank: number;
  target: { id: string; display_name: string; affiliation: string | null };
  current_table_no: number | null;
  reason: { common_topics?: string[]; they_can_give?: string[]; same_orbit?: boolean } | null;
};

export default function TabletalkPage() {
  const [talk, setTalk] = useState<Table | null | undefined>(undefined); // undefined 는 불러오는 중, null 은 미공개
  const [coffee, setCoffee] = useState<Table | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ participant: { id: string } }>("/api/onboarding/me").then((r) => alive && r.ok && setMeId(r.data.participant.id));
    async function load() {
      const [t, c] = await Promise.all([api<Table>("/api/tabletalk/table"), api<Table>("/api/coffeechat/table")]);
      if (!alive) return;
      setTalk(t.ok ? t.data : null);
      if (c.ok) {
        setCoffee(c.data);
        const r = await api<{ recs: Rec[] }>("/api/coffeechat/recs");
        if (alive && r.ok) setRecs(r.data.recs);
      }
    }
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (talk === undefined) return <Loading />;

  return (
    <>
      <TopBar title={coffee ? "커피챗" : "테이블토크"} />
      <main className="space-y-4 p-4">
        {coffee && (
          <>
            <TableCard title="커피챗 테이블" table={coffee} meId={meId} />
            {coffee.talk_prompts && coffee.talk_prompts.length > 0 && (
              <section className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold">대화거리</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {coffee.talk_prompts.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </section>
            )}
            <RecList recs={recs} />
          </>
        )}

        {talk ? (
          <>
            <TableCard title={coffee ? "지난 테이블토크" : "테이블토크 테이블"} table={talk} meId={meId} muted={!!coffee} />
            <SatisfactionCard />
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            테이블 배정이 아직 공개되지 않았다. 공개되면 이 화면에 저절로 뜬다
          </p>
        )}

        {talk && !coffee && (
          <p className="text-center text-xs text-gray-400">커피챗 자리와 추천은 포스터세션 뒤 이 화면 위쪽에 뜬다</p>
        )}
      </main>
    </>
  );
}

function TableCard({ title, table, meId, muted }: { title: string; table: Table; meId: string | null; muted?: boolean }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-4 ${muted ? "opacity-70" : ""}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
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
            {m.topic_tags.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-1">
                {m.topic_tags.map((t) => (
                  <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                    {t}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecList({ recs }: { recs: Rec[] }) {
  if (recs.length === 0) return null;
  return (
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

function SatisfactionCard() {
  // 이 카드는 배정을 불러온 뒤에만 그려지므로(브라우저에서만) 처음 값을 sessionStorage 에서 바로 읽어도 된다
  const [picked, setPicked] = useState<SatisfactionChoice | null>(() => {
    try {
      return (sessionStorage.getItem(SAT_KEY) as SatisfactionChoice | null) ?? null;
    } catch {
      return null;
    }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(choice: SatisfactionChoice) {
    setSaving(true);
    setError(null);
    const r = await api<{ saved: boolean }>("/api/tabletalk/satisfaction", { json: { choice } });
    setSaving(false);
    if (!r.ok) return setError(r.message);
    setPicked(choice);
    try {
      sessionStorage.setItem(SAT_KEY, choice);
    } catch {}
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold">테이블토크는 어땠나</h2>
      <p className="mt-0.5 text-xs text-gray-500">답에 따라 커피챗 추천이 달라진다. 나중에 바꿀 수 있다</p>
      <div className="mt-3 grid gap-2">
        {SATISFACTION_CHOICES.map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={saving}
            onClick={() => choose(c.key)}
            className={`rounded-xl border px-3 py-2 text-left text-sm ${picked === c.key ? "border-black bg-black text-white" : "border-gray-300 bg-white"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {picked && !error && <p className="mt-2 text-xs text-gray-500">저장했다</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
