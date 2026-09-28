// 테이블토크 (담당: 민찬). 내 테이블 번호 · 같은 테이블 사람 소개 · 끝날 때 만족도.
// 배정이 공개되기 전이면 30초마다 다시 확인한다. 커피챗은 독립된 /coffeechat 페이지다(한 페이지로 합칠지는 다음 회의에서).
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
type Table = { table_no: number; label: string | null; members: Member[] };

export default function TabletalkPage() {
  const [talk, setTalk] = useState<Table | null | undefined>(undefined); // undefined 는 불러오는 중, null 은 미공개
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    api<{ participant: { id: string } }>("/api/onboarding/me").then((r) => alive && r.ok && setMeId(r.data.participant.id));
    async function load() {
      const t = await api<Table>("/api/tabletalk/table");
      if (!alive) return;
      setTalk(t.ok ? t.data : null);
      if (!t.ok) timer = setTimeout(load, POLL_MS);
    }
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (talk === undefined) return <Loading />;

  return (
    <>
      <TopBar title="테이블토크" />
      <main className="space-y-4 p-4">
        {talk ? (
          <>
            <section className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">내 테이블</h2>
                <span className="text-xs text-gray-500">{talk.members.length}명</span>
              </div>
              <p className="mt-1 text-3xl font-bold">{talk.table_no}번</p>
              <ul className="mt-3 divide-y divide-gray-100">
                {talk.members.map((m) => (
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
            <SatisfactionCard />
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            테이블 배정이 아직 공개되지 않았다. 공개되면 이 화면에 저절로 뜬다
          </p>
        )}
      </main>
    </>
  );
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
