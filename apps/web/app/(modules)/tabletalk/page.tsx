// 테이블토크 (담당: 민찬). 내 테이블 번호 · 같은 테이블 사람 소개 · 끝날 때 만족도.
// 배정이 공개되기 전이면 30초마다 다시 확인한다. 커피챗은 독립된 /coffeechat 페이지다(한 페이지로 합칠지는 다음 회의에서).
// 주소(SID) 숫자는 보여 주지 않는다(9/27 회의).
// 오류 처리: NOT_PUBLISHED 만 공개 전으로 본다. 세션이 끝나면 온보딩으로 보내고, 그 밖의 오류는 문구와 다시 시도 버튼을 보여 준다.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";
import { SATISFACTION_CHOICES, type SatisfactionChoice } from "@/app/api/tabletalk/_choices";

const POLL_MS = 30_000;
// 같은 폰을 여러 사람이 쓸 수 있어 참가자 id 를 키에 붙인다
const satKey = (pid: string) => `orbit:tabletalk-satisfaction:${pid}`;

type Member = { id: string; display_name: string; affiliation: string | null; topic_tags: string[]; offer_text: string };
type Table = { table_no: number; label: string | null; members: Member[] };
type Status = "loading" | "ready" | "unpublished" | "error";

export default function TabletalkPage() {
  const router = useRouter();
  const [talk, setTalk] = useState<Table | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0); // 다시 시도 버튼이 올리면 effect 가 다시 돈다

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    api<{ participant: { id: string } }>("/api/onboarding/me").then((r) => alive && r.ok && setMeId(r.data.participant.id));
    async function load() {
      const t = await api<Table>("/api/tabletalk/table");
      if (!alive) return;
      if (t.ok) {
        setTalk(t.data);
        setStatus("ready");
        return;
      }
      if (t.code === "UNAUTHORIZED" || t.code === "FORBIDDEN") return router.replace("/onboarding?next=/tabletalk");
      if (t.code === "NOT_PUBLISHED") {
        setStatus("unpublished");
      } else {
        setStatus("error");
        setErrorMsg(t.message);
      }
      timer = setTimeout(load, POLL_MS); // 공개 전 · 일시 오류 모두 30초 뒤 다시 본다
    }
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [router, retry]);

  if (status === "loading") return <Loading />;

  return (
    <>
      <TopBar title="테이블토크" />
      <main className="space-y-4 p-4">
        {status === "ready" && talk ? (
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
            <SatisfactionCard key={meId ?? "anon"} meId={meId} />
          </>
        ) : status === "unpublished" ? (
          <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            테이블 배정이 아직 공개되지 않았다. 공개되면 이 화면에 저절로 뜬다
          </p>
        ) : (
          <section className="space-y-2">
            <p className="rounded-lg bg-yellow-50 px-3 py-3 text-sm text-yellow-800">{errorMsg ?? "불러오지 못했다"}</p>
            <button
              type="button"
              onClick={() => {
                setStatus("loading");
                setRetry((n) => n + 1);
              }}
              className="w-full rounded-xl border border-gray-300 bg-white py-2 text-sm"
            >
              다시 시도
            </button>
          </section>
        )}
      </main>
    </>
  );
}

function SatisfactionCard({ meId }: { meId: string | null }) {
  // 이 카드는 배정을 불러온 뒤(브라우저에서만) 그려지고 meId 가 바뀌면 key 로 다시 만들어지므로 처음 값을 바로 읽어도 된다.
  // 서버에 저장된 답을 돌려주는 API 는 아직 없어 브라우저 기억으로만 표시한다
  const [picked, setPicked] = useState<SatisfactionChoice | null>(() => {
    if (!meId) return null;
    try {
      return (sessionStorage.getItem(satKey(meId)) as SatisfactionChoice | null) ?? null;
    } catch {
      return null;
    }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(choice: SatisfactionChoice) {
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ saved: boolean }>("/api/tabletalk/satisfaction", { json: { choice } });
      if (!r.ok) return setError(r.message);
      setPicked(choice);
      if (meId) {
        try {
          sessionStorage.setItem(satKey(meId), choice);
        } catch {}
      }
    } finally {
      setSaving(false); // 실패해도 버튼이 잠긴 채 남지 않게
    }
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
