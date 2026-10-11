"use client";
// 포스터 화면(피그마 P-1 요약 → P-2 퀴즈 → P-3 결과, 관심 포스터로 선택하기 → 흥미 3단계, 10/11).
// 퀴즈: 이지선다, 정답이면 그 포스터 퀴즈 스탬프(미션 ②), 오답이면 정답을 알려 주지 않고 무제한 다시 풀기. 이미 맞힌 포스터는 퀴즈 풀기 대신 정답 보기.
// 관심 포스터: 피그마의 관심 이유 4칩 대신 팀 결정(0011)의 흥미 3단계로 묻는다. 어떤 답이든 스탬프(미션 ①). 이미 답한 포스터는 버튼을 막는다.
// 응답은 최근 15분 안에 그 포스터를 찍어야 낼 수 있다(서버 규칙). 목록에서 오래 뒤에 열었으면 QR 을 다시 찍게 안내한다.
// 정답은 서버만 안다. 이 화면은 고른 보기 번호만 보낸다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import TabShell from "@/components/TabShell";
import SubHeader from "@/components/figma/SubHeader";
import Stamp from "@/components/figma/Stamp";
import type { ReasonChoice } from "@/app/api/poster/_lib";

type View = {
  poster: { id: number; code: string; title: string; presenter: string | null; tags: string[]; booth: string | null; summary: string | null };
  reasons: { key: ReasonChoice; label: string }[];
  my_reason: ReasonChoice | null;
  quiz: { id: number; question: string; choices: string[] } | null;
  quiz_solved: boolean;
  solved_choice: number | null;
  progress: { responses: number; poster_goal: number; quiz_stamps: number; quiz_goal: number };
};
type Answer = { correct: boolean; quiz_stamps: number; quiz_goal: number };
type Step = "summary" | "quiz" | "result" | "interest";

const REASON_Q = "오늘 이 분야와 관련된 분을 더 만나 보고 싶나요?";

export default function PosterClient({ code, id, via }: { code: string | null; id: number | null; via: "card" | "event" | null }) {
  const router = useRouter();
  const [v, setV] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("summary");
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<Answer | null>(null);
  const [reason, setReason] = useState<ReasonChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const req = code ? api<View>("/api/poster/scan", { json: { qr_payload: code, ...(via ? { via } : {}) } }) : api<View>(`/api/poster/detail?id=${id}`);
    req.then((r) => (r.ok ? setV(r.data) : setError(r.code === "SCAN_REQUIRED" ? "포스터 앞에서 QR을 먼저 찍어 주세요" : r.message)));
  }, [code, id, via]);

  const label = v ? `포스터 ${v.poster.code.replace(/^P-?/i, "").padStart(2, "0")}` : "포스터";
  const shell = (title: string, body: React.ReactNode) => (
    <TabShell showMission header={<SubHeader title={title} tone="brand" back="/event/posters" />}>{body}</TabShell>
  );

  if (error)
    return shell(
      "포스터",
      <main className="space-y-3 px-5 py-6">
        <p className="rounded-2xl bg-field px-4 py-4 text-sm text-ink-2">{error}</p>
        <Link href="/card/scan?via=event" className="flex h-14 items-center justify-center rounded-2xl bg-navy text-lg font-bold text-white">
          QR 스캔하기
        </Link>
      </main>,
    );
  if (!v) return shell("포스터", <Loading />);

  async function submitQuiz() {
    if (!v?.quiz || picked == null) return;
    setBusy(true);
    const r = await api<Answer>("/api/poster/answer", { json: { quiz_id: v.quiz.id, choice_index: picked } });
    setBusy(false);
    if (!r.ok) return setNote(r.code === "SCAN_REQUIRED" ? "포스터 앞에서 QR을 먼저 찍어 주세요" : r.message);
    setResult(r.data);
    if (r.data.correct) setV({ ...v, quiz_solved: true, solved_choice: picked, progress: { ...v.progress, quiz_stamps: r.data.quiz_stamps } });
    setStep("result");
  }

  async function submitReason() {
    if (!v || !reason) return;
    setBusy(true);
    setNote(null);
    const r = await api("/api/poster/response", { json: { poster_id: v.poster.id, reason, shown_order: v.reasons.map((c) => c.key) } });
    setBusy(false);
    if (!r.ok) return setNote(r.code === "SCAN_REQUIRED" ? "포스터를 찍은 지 15분이 지났어요. 포스터 앞에서 QR을 다시 찍어 주세요" : r.message);
    router.push("/event/posters"); // 피그마 A25: 제출 뒤 포스터 목록으로
  }

  const head = (
    <div className="rounded-3xl border border-navy bg-white px-5 py-4">
      <p className="text-xs font-medium text-accent">{v.poster.code}</p>
      <p className="mt-1 text-[17px] font-bold leading-snug text-ink">{v.poster.title}</p>
      <p className="mt-1 text-xs text-ink-2">{[v.poster.tags[0], v.poster.presenter].filter(Boolean).join(" · ")}</p>
    </div>
  );
  const btn = "flex h-14 w-full items-center justify-center rounded-2xl text-lg font-bold";

  if (step === "summary")
    return shell(
      label,
      <main className="space-y-4 px-5 py-5">
        {head}
        <section className="rounded-3xl bg-strip px-5 py-4">
          <p className="text-sm font-bold text-navy">포스터 요약</p>
          <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink">{v.poster.summary || "요약이 곧 준비돼요"}</p>
        </section>
        {v.quiz && (
          <div>
            <button type="button" onClick={() => (v.quiz_solved ? (setPicked(v.solved_choice), setResult({ correct: true, quiz_stamps: v.progress.quiz_stamps, quiz_goal: v.progress.quiz_goal }), setStep("result")) : (setPicked(null), setStep("quiz")))} className={`${btn} border-[1.5px] border-navy bg-white text-navy`}>
              {v.quiz_solved ? "정답 보기" : "퀴즈 풀기"}
            </button>
            {!v.quiz_solved && <p className="mt-1.5 text-center text-xs text-ink-3">맞히면 포스터 퀴즈 스탬프 1개</p>}
          </div>
        )}
        {v.my_reason ? (
          <span className={`${btn} bg-field text-ink-3`}>이미 고른 관심 포스터예요</span>
        ) : (
          <button type="button" onClick={() => setStep("interest")} className={`${btn} bg-navy text-white`}>
            관심 포스터로 선택하기
          </button>
        )}
      </main>,
    );

  if (step === "interest")
    return shell(
      "관심 포스터",
      <main className="space-y-4 px-5 py-5">
        <button type="button" onClick={() => setStep("summary")} className="text-xs text-ink-3 underline">
          요약으로 돌아가기
        </button>
        {head}
        <section className="rounded-3xl border border-line px-5 py-4">
          <p className="text-[15px] font-bold text-ink">{REASON_Q}</p>
          <div className="mt-3 flex flex-col gap-2">
            {v.reasons.map((c) => (
              <button key={c.key} type="button" onClick={() => setReason(c.key)} aria-pressed={reason === c.key} className={`rounded-full border px-4 py-2.5 text-left text-sm ${reason === c.key ? "border-navy bg-navy text-white" : "border-line text-ink"}`}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-3">어떤 답이든 스탬프는 받아요</p>
        </section>
        {note && <p className="rounded-2xl bg-field px-4 py-3 text-sm text-ink-2">{note}</p>}
        <button type="button" onClick={submitReason} disabled={!reason || busy} className={`${btn} bg-navy text-white disabled:bg-field disabled:text-ink-3`}>
          {busy ? "저장 중" : "제출하기"}
        </button>
      </main>,
    );

  const quiz = v.quiz!;
  const correct = step === "result" && result?.correct;
  return shell(
    `${label} 퀴즈`,
    <main className="space-y-4 px-5 py-5">
      <button type="button" onClick={() => setStep("summary")} className="text-xs text-ink-3 underline">
        요약 다시 보기
      </button>
      <div>
        <p className="text-xs font-medium text-accent">{v.poster.code} · 퀴즈</p>
        <p className="mt-1 text-lg font-bold leading-snug text-ink">{quiz.question}</p>
      </div>
      <ul className="space-y-2">
        {quiz.choices.map((c, i) => {
          const sel = picked === i;
          const tag = step === "result" && sel ? (correct ? "정답" : "오답") : null;
          return (
            <li key={i}>
              <button type="button" disabled={step === "result"} onClick={() => setPicked(i)} className={`flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left text-sm ${sel ? "border-navy bg-strip" : "border-line bg-white"}`}>
                <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${sel ? "border-navy" : "border-line"}`}>{sel && <span className="size-2.5 rounded-full bg-navy" />}</span>
                <span className="flex-1 text-ink">{c}</span>
                {tag && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${correct ? "bg-navy text-white" : "bg-[#fdecea] text-[#d93025]"}`}>{tag}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {note && <p className="rounded-2xl bg-field px-4 py-3 text-sm text-ink-2">{note}</p>}
      {step === "quiz" ? (
        <>
          <button type="button" onClick={submitQuiz} disabled={picked == null || busy} className={`${btn} bg-navy text-white disabled:bg-field disabled:text-ink-3`}>
            {busy ? "확인 중" : "정답 확인"}
          </button>
          <p className="text-center text-xs text-ink-3">요약 다시 보기는 뒤로 가기</p>
        </>
      ) : correct ? (
        <>
          <div className="flex items-center gap-4 rounded-3xl border border-navy bg-strip px-5 py-4">
            <Stamp on size={44} />
            <div>
              <p className="text-base font-bold text-navy">정답이에요</p>
              <p className="text-[13px] text-ink-2">{label} 스탬프를 받았어요</p>
            </div>
          </div>
          <Link href="/event/posters" className={`${btn} bg-navy text-white`}>
            포스터 목록으로
          </Link>
          <p className="text-center text-xs text-ink-3">
            포스터 퀴즈 스탬프 {Math.min(result!.quiz_stamps, result!.quiz_goal)} / {result!.quiz_goal}
          </p>
        </>
      ) : (
        <>
          <div className="rounded-3xl border border-line px-5 py-4">
            <p className="text-base font-bold text-ink">아쉽지만 오답이에요</p>
            <p className="text-[13px] text-ink-2">요약을 다시 보고 한 번 더 풀어 보세요</p>
          </div>
          <button type="button" onClick={() => (setPicked(null), setResult(null), setStep("quiz"))} className={`${btn} bg-navy text-white`}>
            다시 풀기
          </button>
          <p className="text-center text-xs text-ink-3">맞히면 포스터 퀴즈 스탬프 1개</p>
        </>
      )}
    </main>,
  );
}
