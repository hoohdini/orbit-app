"use client";
// Offer · Seek 수정과 관심 태그(피그마 10/11). 글자 80, 관심 태그 5개. 태그 추가는 같은 화면 위에 덮는 고르기 화면(피그마 태그 추가).
// 관심 태그는 Offer · Seek 가 같이 쓴다(명함의 INTERESTS). 저장은 /api/my/profile — 명함에만 반영되고 추천에는 반영되지 않는다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import { Notice, Section, bigBtn } from "../../ui";

type Profile = { offer_text: string; seek_text: string; topic_tags: string[] };
const TEXT_MAX = 80;
const TAG_MAX = 5;

export default function TextEdit({ field }: { field: "offer" | "seek" }) {
  const router = useRouter();
  const key = field === "offer" ? "offer_text" : "seek_text";
  const [text, setText] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Profile>("/api/my/profile").then((r) => {
      if (!r.ok) return setError(r.message);
      setText(r.data[key]);
      setTags(r.data.topic_tags);
    });
  }, [key]);

  if (text === null) return error ? <p className="m-5 text-sm text-ink-2">{error}</p> : <Loading />;
  if (picking) return <TagPicker initial={tags} onDone={(t) => (setTags(t), setPicking(false))} />;

  async function save() {
    setBusy(true);
    setError(null);
    const r = await api("/api/my/profile", { json: { [key]: text!.trim(), topic_tags: tags } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.push("/my/card");
  }

  const label = field === "offer" ? "Offer" : "Seek";
  return (
    <main className="space-y-5 px-5 py-7">
      <Notice>
        수정결과는 명함에만 반영되고,
        <br />
        오늘의 추천에는 반영되지 않습니다.
      </Notice>
      <Section title={label}>
        <div className="rounded-2xl border border-navy px-4 pt-4 pb-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={Math.max(TEXT_MAX, text.length)} rows={4} placeholder="내용 입력" className="w-full resize-none text-[15px] text-ink outline-none placeholder:text-ink-3" />
          <p className={`text-right text-xs ${text.length > TEXT_MAX ? "text-[#d93025]" : "text-ink-3"}`}>
            {text.length} / {TEXT_MAX}
          </p>
        </div>
      </Section>
      <Section title="관심 태그" right={<span className="text-xs text-ink-2">{tags.length} / {TAG_MAX} 선택</span>}>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="h-9 rounded-full bg-brand px-4 text-sm font-medium text-white" aria-label={`${t} 빼기`}>
              {t} ✕
            </button>
          ))}
          <button type="button" onClick={() => setPicking(true)} className="h-9 rounded-full border border-dashed border-navy px-4 text-sm text-ink-2">
            + 태그 추가
          </button>
        </div>
      </Section>
      {error && <p className="text-sm text-[#d93025]">{error}</p>}
      <button type="button" onClick={save} disabled={busy || text.length > TEXT_MAX} className={bigBtn}>
        {busy ? "저장 중" : "저장하기"}
      </button>
    </main>
  );
}

// 피그마 태그 추가. 검색어로 행사 태그 모음(/api/my/tags)을 찾고, 없으면 쓴 그대로 추가할 수 있다. 5개까지
function TagPicker({ initial, onDone }: { initial: string[]; onDone: (tags: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(initial);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api<{ tags: string[] }>(`/api/my/tags?q=${encodeURIComponent(q.trim())}`).then((r) => alive && r.ok && setFound(r.data.tags));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const full = sel.length >= TAG_MAX;
  const add = (t: string) => !sel.includes(t) && !full && setSel([...sel, t]);
  const typed = q.replace(/^#/, "").trim().slice(0, 20);
  const list = typed && !found.includes(typed) ? [typed, ...found] : found;

  return (
    <main className="space-y-5 px-5 py-7">
      <div className="flex h-[50px] items-center gap-3 rounded-2xl border border-navy px-4">
        <span aria-hidden className="text-ink-3">⌕</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="태그 검색" className="flex-1 text-[15px] text-ink outline-none placeholder:text-ink-3" autoFocus />
        {q && (
          <button type="button" onClick={() => setQ("")} className="text-xs text-ink-3">
            지우기
          </button>
        )}
      </div>
      <Section title="선택한 태그" right={<span className="text-xs text-ink-2">{sel.length} / {TAG_MAX}</span>}>
        <div className="flex min-h-9 flex-wrap gap-2">
          {sel.map((t) => (
            <button key={t} type="button" onClick={() => setSel(sel.filter((x) => x !== t))} className="h-9 rounded-full bg-brand px-4 text-sm font-medium text-white">
              {t} ✕
            </button>
          ))}
        </div>
      </Section>
      <Section title="검색 결과">
        <ul className="overflow-hidden rounded-3xl border border-navy bg-white py-1">
          {list.length === 0 && <li className="px-5 py-4 text-sm text-ink-3">검색어를 입력해 보세요</li>}
          {list.map((t, i) => {
            const on = sel.includes(t);
            return (
              <li key={t} className={`flex items-center justify-between px-5 py-3 ${i < list.length - 1 ? "border-b border-line" : ""}`}>
                <span className="text-[15px] text-ink"># {t}</span>
                <button type="button" onClick={() => (on ? setSel(sel.filter((x) => x !== t)) : add(t))} disabled={!on && full} className={`h-8 rounded-full px-3 text-sm ${on ? "bg-brand text-white" : "border border-navy text-ink disabled:opacity-40"}`}>
                  {on ? "추가됨" : "추가"}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-ink-3">태그는 최대 5개까지 선택할 수 있습니다</p>
      </Section>
      <button type="button" onClick={() => onDone(sel)} className={bigBtn}>
        선택 완료
      </button>
    </main>
  );
}
