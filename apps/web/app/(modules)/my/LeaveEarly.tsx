"use client";
// 조기 퇴장 · 재입장(10/25 민찬 결정, POST /api/checkin/leave · checkins.left_at). 마이 탭 첫 화면, 내 계정 위에 한 줄로 둔다.
// 문구는 짧게(10/25 민찬): 시스템 동작 · 운영진 전달 설명은 넣지 않고, 확인 창에 "커피챗 자리가 배정되지 않습니다." 한 줄만 둔다
// 등록 · 개회부터 커피챗까지(state.leave_open)이고 체크인한 사람에게만 보인다. 마무리 뒤에는 숨긴다. DB 에 0019 가 없으면(state.leave_available false) 숨긴다.
// 누르면 화면 안의 작은 확인 시트(window.confirm 아님)가 뜨고, 확인하면 표시한다. 표시한 뒤에는 같은 자리가 재입장으로 바뀐다
// 나간 사람에게는 아래에 '행사 후기 남기기' 한 줄을 더 둔다(/event/feedback, 10/25 민찬 결정). 이미 냈거나 동의 거부자면 숨긴다. 낸 여부를 못 읽으면 보인다
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/components/Toast";
import { useOrbitState, refreshOrbitState } from "@/components/useOrbitState";
import { Row, RowGroup, Section, bigBtn, ghostBtn } from "./ui";

export default function LeaveEarly() {
  const s = useOrbitState();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fbDone, setFbDone] = useState(false);
  const left = !!s?.left_at;

  // 후기는 모듈 밖이라 URL 로만 읽는다(docs/MODULES.md)
  useEffect(() => {
    if (!left) return;
    let alive = true;
    api<{ feedback: unknown | null }>("/api/event/feedback").then((r) => {
      if (alive) setFbDone(r.ok && !!r.data.feedback);
    });
    return () => {
      alive = false;
    };
  }, [left]);

  if (!s || !s.leave_open || !s.checked_in || s.leave_available === false) return null;

  async function submit() {
    setBusy(true);
    const r = await api<{ left_at: string | null }>("/api/checkin/leave", { json: { undo: left } });
    setBusy(false);
    setSheet(false);
    if (!r.ok) {
      const msg: Record<string, string> = {
        LEAVE_NOT_OPEN: "지금은 바꿀 수 없습니다",
        LEAVE_UNAVAILABLE: "지금은 조기 퇴장을 쓸 수 없습니다", // DB 에 0019 가 없음(503)
      };
      return toast(msg[r.code] ?? "바꾸지 못했습니다. 다시 눌러 주세요", "error");
    }
    refreshOrbitState(); // 되돌렸으면 다음 상태에서 커피챗 자리를 받는다
  }

  return (
    <Section title="참석">
      <RowGroup>
        <button type="button" onClick={() => setSheet(true)} className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-base font-medium leading-6 tracking-[-0.16px] text-ink">{left ? "재입장" : "조기 퇴장"}</span>
          </span>
        </button>
        {left && !fbDone && s.consent !== "refused" && <Row href="/event/feedback" title="행사 후기 남기기" />}
      </RowGroup>
      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#0c1733]/45" role="dialog" aria-modal="true" onClick={() => !busy && setSheet(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-white px-6 pt-6 pb-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold text-ink">{left ? "재입장할까요?" : "조기 퇴장할까요?"}</p>
            {!left && <p className="mt-2 text-sm leading-relaxed text-ink-2">커피챗 자리가 배정되지 않습니다.</p>}
            <div className="mt-5 space-y-2">
              <button type="button" disabled={busy} onClick={submit} className={bigBtn}>
                {left ? "재입장" : "조기 퇴장"}
              </button>
              <button type="button" disabled={busy} onClick={() => setSheet(false)} className={ghostBtn}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
