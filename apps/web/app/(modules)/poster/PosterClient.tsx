"use client";
// 포스터세션 화면. code 가 없으면 스탬프판 + QR 찍기, 있으면 그 포스터의 퀴즈 → 결과 → 관심도 순서로 간다.
// 정답은 서버만 안다. 이 화면은 고른 보기 번호만 보낸다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import TopBar from "@/components/TopBar";
import Loading from "@/components/Loading";
import QrScanner from "@/components/QrScanner";
import { INTEREST_CHOICES, parsePosterCode, type InterestChoice } from "@/app/api/poster/_lib";

type Stamps = { stamps: { poster_id: number; title: string; created_at: string }[]; total: number; tickets: { reason: string; issued_at: string }[] };
type Quiz = { poster: { id: number; title: string }; quiz: { id: number; question: string; choices: string[] } };
type Answer = { correct: boolean; stamp_count: number; ticket_issued: boolean };

export default function PosterClient({ code }: { code: string | null }) {
  return code ? <QuizFlow code={code} /> : <StampBoard />;
}

function StampBoard() {
  const router = useRouter();
  const [data, setData] = useState<Stamps | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<Stamps>("/api/poster/stamps").then((r) => r.ok && setData(r.data));
  }, []);

  function onDecode(text: string) {
    // 명찰 QR(/card?p=)은 URL 이지만 /poster 가 아니라 null 이 나온다
    const c = parsePosterCode(text);
    if (!c) return setNotice("포스터 QR 이 아니다. 명찰 QR 은 명함 탭에서 찍는다");
    router.push(`/poster?c=${encodeURIComponent(c)}`);
  }

  if (!data) return <Loading />;
  const got = data.stamps.length;
  const pct = data.total > 0 ? Math.round((got / data.total) * 100) : 0;

  return (
    <>
      <TopBar title="스탬프 투어" />
      <main className="space-y-4 p-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">모은 스탬프</h2>
            <span className="text-xs text-gray-500">응모권 {data.tickets.length}장</span>
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
            <button type="button" onClick={() => setScanning(false)} className="w-full rounded-xl border border-gray-300 py-2 text-sm">
              닫기
            </button>
          </section>
        ) : (
          <button type="button" onClick={() => setScanning(true)} className="w-full rounded-xl bg-black py-3 text-sm font-semibold text-white">
            포스터 QR 찍기
          </button>
        )}
        {notice && <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{notice}</p>}
        <p className="text-xs text-gray-500">포스터 앞의 QR 을 찍으면 퀴즈가 나온다. 맞히면 스탬프를 받고, 스탬프가 모이면 응모권이 나온다</p>
      </main>
    </>
  );
}

function QuizFlow({ code }: { code: string }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<Answer | null>(null);
  const [sending, setSending] = useState(false);
  const [interest, setInterest] = useState<InterestChoice | null>(null);
  const [already, setAlready] = useState(false); // 이미 스탬프를 받은 포스터면 다시 풀어도 새로 받지 않는다

  useEffect(() => {
    api<Quiz>("/api/poster/scan", { json: { qr_payload: code } }).then(async (r) => {
      if (!r.ok) return setError(r.message);
      const st = await api<Stamps>("/api/poster/stamps");
      setAlready(st.ok && st.data.stamps.some((x) => x.poster_id === r.data.poster.id));
      setQuiz(r.data);
    });
  }, [code]);

  async function submit() {
    if (!quiz || picked == null) return;
    setSending(true);
    const r = await api<Answer>("/api/poster/answer", { json: { quiz_id: quiz.quiz.id, choice_index: picked } });
    setSending(false);
    if (!r.ok) {
      if (r.code === "TOO_MANY_ATTEMPTS") return setError("이 포스터는 시도 횟수를 다 썼다. 다른 포스터로 가 본다");
      if (r.code === "SCAN_REQUIRED") return setError("포스터를 찍은 지 오래됐다. QR 을 다시 찍는다");
      return setError(r.message);
    }
    setResult(r.data);
  }

  async function saveInterest(choice: InterestChoice) {
    if (!quiz) return;
    const r = await api<{ saved: boolean }>("/api/poster/interest", { json: { poster_id: quiz.poster.id, choice } });
    if (r.ok) setInterest(choice);
    else setError(r.message);
  }

  if (error)
    return (
      <>
        <TopBar title="포스터 퀴즈" right={[{ href: "/poster", label: "스탬프판" }]} />
        <main className="space-y-4 p-4">
          <p className="rounded-lg bg-yellow-50 px-3 py-3 text-sm text-yellow-800">{error}</p>
          <button type="button" onClick={() => router.replace("/poster")} className="w-full rounded-xl border border-gray-300 py-2 text-sm">
            스탬프판으로
          </button>
        </main>
      </>
    );
  if (!quiz) return <Loading />;

  return (
    <>
      <TopBar title="포스터 퀴즈" right={[{ href: "/poster", label: "스탬프판" }]} />
      <main className="space-y-4 p-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">{quiz.poster.title}</p>
          {already && <p className="mt-1 text-xs text-green-700">이미 스탬프를 받은 포스터다. 다시 풀어도 새로 받지는 않는다</p>}
          <h2 className="mt-1 text-base font-semibold">{quiz.quiz.question}</h2>
          <div className="mt-3 grid gap-2">
            {quiz.quiz.choices.map((c, i) => (
              <button
                key={i}
                type="button"
                disabled={!!result?.correct || sending}
                onClick={() => {
                  setPicked(i);
                  setResult(null);
                }}
                className={`rounded-xl border px-3 py-2 text-left text-sm ${picked === i ? "border-black bg-black text-white" : "border-gray-300 bg-white"}`}
              >
                {c}
              </button>
            ))}
          </div>
          {!result?.correct && (
            <button
              type="button"
              disabled={picked == null || sending}
              onClick={submit}
              className="mt-3 w-full rounded-xl bg-black py-2 text-sm font-semibold text-white disabled:bg-gray-300"
            >
              {sending ? "확인 중" : "제출"}
            </button>
          )}
          {result && !result.correct && <p className="mt-2 text-sm text-red-600">아쉽다. 다른 보기를 골라 다시 제출한다(시도 횟수에 한도가 있다)</p>}
        </section>

        {result?.correct && (
          <section className="rounded-2xl border border-gray-200 bg-white p-4 text-center">
            <p className="text-lg font-bold">{already ? "정답. 이미 받은 스탬프다" : "정답. 스탬프를 받았다"}</p>
            <p className="mt-1 text-sm text-gray-600">지금까지 {result.stamp_count}개</p>
            {result.ticket_issued && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">응모권 1장이 나왔다</p>}
          </section>
        )}

        {result && (
          <section className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold">이 포스터는 어땠나</h2>
            <div className="mt-3 grid gap-2">
              {INTEREST_CHOICES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => saveInterest(c.key)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${interest === c.key ? "border-black bg-black text-white" : "border-gray-300 bg-white"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {interest && (
              <button type="button" onClick={() => router.replace("/poster")} className="mt-3 w-full rounded-xl bg-black py-2 text-sm font-semibold text-white">
                스탬프판으로
              </button>
            )}
          </section>
        )}
      </main>
    </>
  );
}
