"use client";
// 행사 후기 입력(피그마 R-1 · R-2). 만족도 3단계(최고였다 · 좋았다 · 별로였다)를 고르면 제출 버튼이 켜진다. 좋았던 점과 한마디는 선택이다(스탬프 조건은 만족도만).
// 제출하면 완료 화면(R-3)으로 간다. 저장은 store.ts 가 서버(/api/event/feedback)로 보낸다.
// 후기는 커피챗이 끝난 뒤(wrapup · award)에만 받는다(10/22 민찬 결정). 그 전에 주소로 들어오면 안내를 띄우고 제출 버튼을 막는다(서버도 409 로 막는다).
// 조기 퇴장한 사람(state.left_at)은 그 전에도 연다(10/25 민찬 결정).
// 이용 동의 거부자는 후기를 낼 수 없다(10/23 민찬 결정). 입력칸 대신 안내만 보인다(서버도 403 CONSENT_REFUSED 로 막는다).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrbitState } from "@/components/useOrbitState";
import { feedbackOpen } from "@/lib/phase";
import { REFUSED_TEXT, loadFeedback, saveFeedback } from "./store";
import { COMMENT_MAX, FEEDBACK_TAGS, RATINGS } from "./choices";

export default function FeedbackForm() {
  const router = useRouter();
  const st = useOrbitState();
  const open = !st || feedbackOpen(st.phase) || !!st.left_at; // 상태를 아직 못 읽었으면 막지 않는다(서버가 다시 본다)
  const refused = st?.consent === "refused";
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 이미 낸 적이 있으면 그 내용을 채운다(다시 내면 덮어씀)
  useEffect(() => {
    let alive = true;
    loadFeedback().then((r) => {
      const prev = r.ok ? r.feedback : null;
      if (!alive || !prev) return;
      setRating(prev.rating);
      setTags(prev.tags);
      setComment(prev.comment);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (key: string) => setTags((t) => (t.includes(key) ? t.filter((k) => k !== key) : [...t, key]));
  const submit = async () => {
    if (!rating || busy || !open) return;
    setBusy(true);
    setErr(null);
    const e = await saveFeedback({ rating, tags, comment: comment.trim() });
    if (e) {
      setErr(e);
      setBusy(false);
      return;
    }
    router.push("/event/feedback/done");
  };

  if (refused)
    return (
      <main className="space-y-3 px-5 pt-8 text-center">
        <p className="rounded-2xl bg-field px-4 py-3 text-sm text-ink-2">{REFUSED_TEXT}</p>
        <Link href="/event" className="flex h-14 items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white">
          현황판으로
        </Link>
      </main>
    );

  return (
    <main className="space-y-3 px-5 pt-5 pb-6">
      {!open && <p className="rounded-2xl bg-field px-4 py-3 text-center text-sm text-ink-2">커피챗이 끝나면 열립니다</p>}
      <section className="rounded-3xl border border-navy bg-white px-5 py-4">
        <h2 className="text-[17px] font-medium text-navy">행사는 어땠습니까?</h2>
        <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="만족도">
          {RATINGS.map((r) => (
            <button key={r.value} type="button" role="radio" aria-checked={rating === r.value} onClick={() => setRating(r.value)} className={`flex flex-col items-center gap-1 rounded-2xl border py-3 text-sm font-medium ${rating === r.value ? "border-navy bg-navy text-white" : "border-line bg-white text-ink"}`}>
              <span className="text-xl" aria-hidden>
                {r.icon}
              </span>
              {r.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-navy bg-white px-5 py-4">
        <h2 className="text-[17px] font-medium text-navy">
          어떤 점이 좋았습니까? <span className="ml-1 text-xs font-normal text-ink-3">복수 선택</span>
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {FEEDBACK_TAGS.map((t) => {
            const on = tags.includes(t.key);
            return (
              <button key={t.key} type="button" aria-pressed={on} onClick={() => toggle(t.key)} className={`rounded-full px-3.5 py-2 text-sm font-medium ${on ? "border-[1.5px] border-navy bg-strip text-navy" : "border border-line bg-white text-ink"}`}>
                {t.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-navy bg-white px-5 py-4">
        <h2 className="text-[17px] font-medium text-navy">
          한마디 남겨 주세요 <span className="ml-1 text-xs font-normal text-ink-3">선택</span>
        </h2>
        <div className={`mt-3 rounded-2xl bg-white px-4 py-3 ${comment ? "border-[1.5px] border-navy" : "border border-line"}`}>
          <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))} maxLength={COMMENT_MAX} rows={3} placeholder="불편했던 점이나 바라는 점을 자유롭게 남겨 주세요" className="block w-full resize-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" />
          <p className="text-right text-xs text-ink-3">
            {comment.length} / {COMMENT_MAX}
          </p>
        </div>
      </section>

      {err && <p className="text-center text-sm text-ink-2">{err}</p>}
      <button type="button" onClick={submit} disabled={!rating || busy || !open} className="flex h-14 w-full items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white disabled:bg-[#d9d9d9] disabled:text-white">
        후기 제출하기
      </button>
    </main>
  );
}
