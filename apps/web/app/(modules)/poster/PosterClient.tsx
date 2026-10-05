"use client";
// 포스터세션 화면. code 가 없으면 스탬프판 + QR 찍기, 있으면 그 포스터의 관심 이유 → (선택) 퀴즈 순서로 간다(개발 지시서 v0.2 E-02).
// 관심 이유를 내면 그 포스터 스탬프를 받는다(미션 ①: 서로 다른 포스터 2개). 퀴즈는 선택이고 스탬프 · 응모권과 무관하다.
// 정답은 서버만 안다. 이 화면은 고른 보기 번호만 보낸다. 데모 화면이라 프론트엔드가 E-01 · E-02 화면을 만들면 바뀐다.
// 오류 처리: 불러오기 실패는 로딩 대신 문구와 다시 시도 버튼, 저장 실패는 그 카드 안 문구로 보여 준다. 화면 전체를 오류로 바꾸는 것은 스캔 실패뿐이다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";
import QrScanner from "@/components/QrScanner";
import { POSTER_MISSION_GOAL, type ReasonChoice } from "@/app/api/poster/_lib";

type Stamps = { stamps: { poster_id: number; title: string; created_at: string }[]; total: number; tickets: { reason: string; issued_at: string }[] };
type Scan = {
  poster: { id: number; code: string; title: string; presenter: string | null };
  reasons: { key: ReasonChoice; label: string }[];
  my_reason: ReasonChoice | null;
  quiz: { id: number; question: string; choices: string[] } | null;
};
type Answer = { correct: boolean; stamp_count: number; ticket_issued: boolean };
type Saved = { saved: boolean; count: number; goal: number; done: boolean };

export default function PosterClient({ code }: { code: string | null }) {
  return code ? <PosterFlow code={code} /> : <StampBoard />;
}

// 앱 스캐너가 읽은 문자열에서 포스터 코드를 뽑는다. docs/QR_FORMAT.md 의 포스터 QR(https://<앱주소>/poster?c=<code>) 형식만 받는다.
// 서버의 parsePosterCode 는 수동 입력용으로 아무 문자열이나 코드로 보지만, 카메라는 아무 QR · 바코드나 읽으므로 URL 만 받는다(명함 스캔 화면과 같은 규칙).
function posterCodeFromQr(text: string): string | null {
  try {
    const u = new URL(text.trim());
    if (!u.pathname.endsWith("/poster")) return null;
    const c = u.searchParams.get("c");
    return c && c.trim() ? c.trim() : null;
  } catch {
    return null;
  }
}

function ErrorWithRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="space-y-2">
      <p className="rounded-lg bg-yellow-50 px-3 py-3 text-sm text-yellow-800">{message}</p>
      <button type="button" onClick={onRetry} className="w-full rounded-xl border border-gray-300 bg-white py-2 text-sm">
        다시 시도
      </button>
    </section>
  );
}

function StampBoard() {
  const router = useRouter();
  const [data, setData] = useState<Stamps | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<Stamps>("/api/poster/stamps").then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
      else setLoadError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [retry]);

  function onDecode(text: string) {
    // 명찰 QR(/card?p=)은 URL 이지만 /poster 가 아니라 null 이 나온다. 스폰서 QR · 상품 바코드 같은 일반 문자열도 null
    const c = posterCodeFromQr(text);
    if (!c) return setNotice("포스터 QR 이 아니다. 명찰 QR 은 명함 탭에서 찍는다");
    router.push(`/poster?c=${encodeURIComponent(c)}`);
  }

  if (!data) {
    if (!loadError) return <Loading />;
    return (
      <>
        <TopBar title="스탬프 투어" />
        <main className="space-y-4 p-4">
          <ErrorWithRetry
            message={loadError}
            onRetry={() => {
              setLoadError(null);
              setRetry((n) => n + 1);
            }}
          />
        </main>
      </>
    );
  }
  const got = data.stamps.length;
  const pct = data.total > 0 ? Math.round((got / data.total) * 100) : 0;

  return (
    <>
      <TopBar title="스탬프 투어" />
      <main className="space-y-4 p-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">모은 스탬프</h2>
            <span className="text-xs text-gray-500">미션 ① {Math.min(got, POSTER_MISSION_GOAL)}/{POSTER_MISSION_GOAL}</span>
          </div>
          <p className="mt-1 text-3xl font-bold">
            {got}
            <span className="text-base font-normal text-gray-500"> / {data.total}</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-black" style={{ width: `${pct}%` }} />
          </div>
          {got > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {data.stamps.map((s) => (
                <li key={s.poster_id} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-black" />
                  {s.title}
                </li>
              ))}
            </ul>
          )}
        </section>

        {scanning ? (
          <section className="space-y-2">
            <QrScanner onDecode={onDecode} onDenied={() => setNotice("카메라를 쓸 수 없다. 폰 기본 카메라로 포스터 QR 을 찍어도 된다")} />
            <button type="button" onClick={() => setScanning(false)} className="w-full rounded-xl border border-gray-300 bg-white py-2 text-sm">
              닫기
            </button>
          </section>
        ) : (
          <button type="button" onClick={() => setScanning(true)} className="w-full rounded-xl bg-black py-3 text-sm font-semibold text-white">
            포스터 QR 찍기
          </button>
        )}
        {notice && <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{notice}</p>}
        <p className="text-xs text-gray-500">포스터 앞의 QR 을 찍고 관심 이유를 고르면 스탬프를 받는다. 서로 다른 포스터 2개면 미션 ① 완료. 퀴즈는 풀어 보고 싶을 때만</p>
      </main>
    </>
  );
}

function PosterFlow({ code }: { code: string }) {
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
  const [quizClosed, setQuizClosed] = useState<string | null>(null); // 시도 횟수를 다 쓴 경우 등. 관심 이유는 계속 낼 수 있다

  useEffect(() => {
    let alive = true;
    api<Scan>("/api/poster/scan", { json: { qr_payload: code } }).then((r) => {
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
  }, [code, retry]);

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
          <button type="button" onClick={() => router.replace("/poster")} className="w-full rounded-xl border border-gray-300 bg-white py-2 text-sm">
            스탬프판으로
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
          <p className="mt-3 text-sm">어떤 점이 눈에 들어왔나요?</p>
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
          {!saved && reason && <p className="mt-2 text-xs text-gray-500">이미 고른 이유다. 다른 것을 누르면 바꾼다</p>}
        </section>

        {quiz && (
          <section className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">퀴즈(선택)</p>
            <h2 className="mt-1 text-base font-semibold">{quiz.question}</h2>
            <div className="mt-3 grid gap-2">
              {quiz.choices.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!!result?.correct || sending || !!quizClosed}
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
            {!result?.correct && !quizClosed && (
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
            {result && !result.correct && <p className="mt-2 text-sm text-red-600">다른 보기를 골라 다시 제출할 수 있다(시도 횟수에 한도가 있다)</p>}
            {quizError && <p className="mt-2 text-sm text-red-600">{quizError}</p>}
            {quizClosed && <p className="mt-2 text-sm text-gray-600">{quizClosed}</p>}
          </section>
        )}

        <button type="button" onClick={() => router.replace("/poster")} className="w-full rounded-xl border border-gray-300 bg-white py-2 text-sm">
          스탬프판으로
        </button>
      </main>
    </>
  );
}
