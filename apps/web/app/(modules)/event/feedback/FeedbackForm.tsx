"use client";
// 피드백 입력(피그마 R-1 · R-2). 별점을 고르면 제출 버튼이 켜진다. 좋았던 점과 한마디는 선택이다(스탬프 조건은 별점만).
// 제출하면 완료 화면(R-3)으로 간다. 서버 API 가 나오기 전에는 mock.ts 가 이 기기에 저장한다.
// 서버가 나오면 submit 안의 saveFeedback 을 api(..., { json: { rating, tags, comment } }) 호출로 바꾼다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadFeedback, saveFeedback } from "../mock";
import { COMMENT_MAX, FEEDBACK_TAGS, RATINGS } from "./choices";

export default function FeedbackForm() {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");

  // 이미 낸 적이 있으면 그 내용을 채운다(다시 내면 덮어씀)
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      const prev = loadFeedback();
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
  const submit = () => {
    if (!rating) return;
    saveFeedback({ rating, tags, comment: comment.trim() });
    router.push("/event/feedback/done");
  };

  return (
    <main className="space-y-3 px-5 pt-5 pb-6">
      <section className="rounded-3xl border border-navy bg-white px-5 py-4">
        <h2 className="text-[17px] font-medium text-navy">ORBIT.app은 어땠습니까?</h2>
        <div className="mt-3 flex gap-2" role="radiogroup" aria-label="별점">
          {RATINGS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(n)} className={`h-9 flex-1 rounded-full border text-sm font-medium ${rating === n ? "border-navy bg-navy text-white" : "border-line bg-white text-ink"}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-ink-3">
          <span>아쉽다</span>
          <span>최고다</span>
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

      <button type="button" onClick={submit} disabled={!rating} className="flex h-14 w-full items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white disabled:bg-[#d9d9d9] disabled:text-white">
        피드백 제출하기
      </button>
      <p className="text-center text-xs text-ink-3">제출하면 스탬프 획득</p>
    </main>
  );
}
