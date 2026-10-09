"use client";
// 포스터 응답 화면. 그 포스터의 응답(흥미 3단계) → (선택) 퀴즈 순서로 간다(개발 지시서 v0.2 E-02). 미션 현황판은 이벤트 탭(/event)이다.
// 응답을 내면 어떤 답이든 그 포스터 스탬프를 받는다(미션 ①: 서로 다른 포스터 2개). 퀴즈는 이지선다 · 한 번만이고 스탬프 · 응모권과 무관하다.
// 정답은 서버만 안다. 이 화면은 고른 보기 번호만 보낸다. 데모 화면이라 프론트엔드가 E-01 · E-02 화면을 만들면 바뀐다.
// 오류 처리: 불러오기 실패는 로딩 대신 문구와 다시 시도 버튼, 저장 실패는 그 카드 안 문구로 보여 준다. 화면 전체를 오류로 바꾸는 것은 스캔 실패뿐이다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";
import type { ReasonChoice } from "@/app/api/poster/_lib";

type Scan = {
  poster: { id: number; code: string; title: string; presenter: string | null };
  reasons: { key: ReasonChoice; label: string }[];
  my_reason: ReasonChoice | null;
  quiz: { id: number; question: string; choices: string[] } | null;
};
type Answer = { correct: boolean; stamp_count: number; ticket_issued: boolean };
type Saved = { saved: boolean; count: number; goal: number; done: boolean };

// via 는 스캐너를 연 탭(card 명함 탭 · event 이벤트 탭). 운영 콘솔 탭 불일치 수에만 쓴다. 폰 기본 카메라로 들어오면 null
export default function PosterClient({ code, via }: { code: string; via: "card" | "event" | null }) {
  return <PosterFlow code={code} via={via} />;
}

function PosterFlow({ code, via }: { code: string; via: "card" | "event" | null }) {
  const router = useRouter();
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null); // 스캔이 더 갈 수 없을 때. 화면 전체를 바꾼다
  const [retryable, setRetryable] = useState(false); // 스캔 실패가 일시적이면 다시 시도 버튼을 보여 준다
  const [retry, setRetry] = useState(0);
  const [reason, setReason] = useState<ReasonChoice | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [savingReason, setSavingReason] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<Answer | null>(null);
  const [sending, setSending] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null); // 퀴즈 제출 실패. 퀴즈 카드 안 문구
  const [quizClosed, setQuizClosed] = useState<string | null>(null); // 시도 횟수를 다 쓴 경우 등. 포스터 응답은 계속 낼 수 있다

  useEffect(() => {
    let alive = true;
    api<Scan>("/api/poster/scan", { json: { qr_payload: code, ...(via ? { via } : {}) } }).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setRetryable(r.code === "NETWORK" || r.code === "INTERNAL" || r.code === "BAD_RESPONSE");
        return setError(r.message);
      }
      setScan(r.data);
      setReason(r.data.my_reason);
    });
    return () => {
      alive = false;
    };
  }, [code, via, retry]);

  async function submitReason(choice: ReasonChoice) {
    if (!scan) return;
    setSavingReason(true);
    setReasonError(null);
    try {
      const r = await api<Saved>("/api/poster/response", {
        json: { poster_id: scan.poster.id, reason: choice, shown_order: scan.reasons.map((c) => c.key) },
      });
      if (!r.ok) {
        if (r.code === "SCAN_REQUIRED") return setError("포스터를 찍은 지 오래됐다. QR 을 다시 찍는다");
        return setReasonError(r.message);
      }
      setReason(choice);
      setSaved(r.data);
    } finally {
      setSavingReason(false);
    }
  }

  async function submitQuiz() {
    if (!scan?.quiz || picked == null) return;
    setSending(true);
    setQuizError(null);
    try {
      const r = await api<Answer>("/api/poster/answer", { json: { quiz_id: scan.quiz.id, choice_index: picked } });
      if (!r.ok) {
        if (r.code === "TOO_MANY_ATTEMPTS") return setQuizClosed("이 포스터 퀴즈는 시도 횟수를 다 썼다");
        if (r.code === "SCAN_REQUIRED") return setError("포스터를 찍은 지 오래됐다. QR 을 다시 찍는다");
        return setQuizError(r.message);
      }
      setResult(r.data);
    } finally {
      setSending(false); // 실패해도 제출 버튼과 보기가 잠긴 채 남지 않게
    }
  }

  if (error)
    return (
      <>
        <TopBar title="포스터" right={[{ href: "/poster", label: "스탬프판" }]} />
        <main className="space-y-4 p-4">
          <p className="rounded-lg bg-yellow-50 px-3 py-3 text-sm text-yellow-800">{error}</p>
          {retryable && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setRetryable(false);
                setRetry((n) => n + 1);
              }}
              className="w-full rounded-xl bg-black py-2 text-sm font-semibold text-white"
            >
              다시 시도
            </button>
          )}
          <button type="button" onClick={() => router.replace("/event")} className="w-full rounded-xl border border-gray-300 bg-white py-2 text-sm">
            미션 현황으로
          </button>
        </main>
      </>
    );
  if (!scan) return <Loading />;
  const quiz = scan.quiz;

  return (
    <>
      <TopBar title="포스터" right={[{ href: "/poster", label: "스탬프판" }]} />
      <main className="space-y-4 p-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">{scan.poster.code}{scan.poster.presenter ? ` · ${scan.poster.presenter}` : ""}</p>
          <h2 className="mt-1 text-base font-semibold">{scan.poster.title}</h2>
          <p className="mt-3 text-sm">오늘 이 분야와 관련된 분을 더 만나 보고 싶나요?</p>
          <p className="mt-0.5 text-xs text-gray-500">어떤 답이든 스탬프는 받아요</p>
          <div className="mt-2 grid gap-2">
            {scan.reasons.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={savingReason}
                onClick={() => submitReason(c.key)}
                className={`rounded-xl border px-3 py-2 text-left text-sm ${reason === c.key ? "border-black bg-black text-white" : "border-gray-300 bg-white"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {reasonError && <p className="mt-2 text-xs text-red-600">{reasonError}</p>}
          {saved && (
            <p className="mt-2 text-sm text-green-700">
              {saved.done ? `미션 ① 완료 (포스터 ${saved.count}개)` : `제출했다. 포스터 ${saved.count}/${saved.goal}`}
            </p>
          )}
          {!saved && reason && <p className="mt-2 text-xs text-gray-500">이미 답했다. 다른 것을 누르면 바꾼다</p>}
        </section>

        {quiz && (
          <section className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">퀴즈(선택 · 한 번만)</p>
            <h2 className="mt-1 text-base font-semibold">{quiz.question}</h2>
            <div className="mt-3 grid gap-2">
              {quiz.choices.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!!result || sending || !!quizClosed}
                  onClick={() => {
                    setPicked(i);
                    setResult(null);
                    setQuizError(null);
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${picked === i ? "border-black bg-black text-white" : "border-gray-300 bg-white"}`}
                >
                  {c}
                </button>
              ))}
            </div>
            {!result && !quizClosed && (
              <button
                type="button"
                disabled={picked == null || sending}
                onClick={submitQuiz}
                className="mt-3 w-full rounded-xl bg-black py-2 text-sm font-semibold text-white disabled:bg-gray-300"
              >
                {sending ? "확인 중" : "제출"}
              </button>
            )}
            {result?.correct && <p className="mt-2 text-sm text-green-700">정답이다</p>}
            {result && !result.correct && <p className="mt-2 text-sm text-gray-600">아쉽게도 오답이다. 퀴즈는 한 번만 풀 수 있다</p>}
            {quizError && <p className="mt-2 text-sm text-red-600">{quizError}</p>}
            {quizClosed && <p className="mt-2 text-sm text-gray-600">{quizClosed}</p>}
          </section>
        )}

        <button type="button" onClick={() => router.replace("/event")} className="w-full rounded-xl border border-gray-300 bg-white py-2 text-sm">
          미션 현황으로
        </button>
      </main>
    </>
  );
}
