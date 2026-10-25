"use client";
// 일찍 나가요(10/25 민찬 결정, POST /api/checkin/leave · checkins.left_at). 마이 탭 첫 화면, 내 계정 위에 한 줄로 둔다.
// 등록 · 개회부터 커피챗까지(state.leave_open)이고 체크인한 사람에게만 보인다. 마무리 뒤에는 숨긴다.
// 누르면 화면 안의 작은 확인 시트(window.confirm 아님)가 뜨고, 확인하면 표시한다. 표시한 뒤에는 같은 자리가 다시 참여할게요로 바뀐다
import { useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/components/Toast";
import { useOrbitState, refreshOrbitState } from "@/components/useOrbitState";
import { RowGroup, Section, bigBtn, ghostBtn } from "./ui";

function hm(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function LeaveEarly() {
  const s = useOrbitState();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!s || !s.leave_open || !s.checked_in) return null;
  const left = !!s.left_at;

  async function submit() {
    setBusy(true);
    const r = await api<{ left_at: string | null }>("/api/checkin/leave", { json: { undo: left } });
    setBusy(false);
    setSheet(false);
    if (!r.ok) return toast(r.code === "LEAVE_NOT_OPEN" ? "지금은 바꿀 수 없습니다" : "바꾸지 못했습니다. 다시 눌러 주세요", "error");
    toast(left ? "다시 참여로 바꿨습니다" : "일찍 나가신다고 표시했습니다");
    refreshOrbitState(); // 되돌렸으면 다음 상태에서 커피챗 자리를 받는다
  }

  return (
    <Section title="행사장">
      <RowGroup>
        <button type="button" onClick={() => setSheet(true)} className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-base font-medium leading-6 tracking-[-0.16px] text-ink">{left ? "다시 참여할게요" : "일찍 나가요"}</span>
            <span className="block truncate text-sm leading-5 tracking-[-0.14px] text-ink-2">
              {left ? `${hm(s.left_at!)} 에 나간다고 표시했습니다` : "커피챗 전에 가시면 눌러 주세요"}
            </span>
          </span>
          <span className="shrink-0 text-sm font-medium text-brand">{left ? "되돌리기" : "표시"}</span>
        </button>
      </RowGroup>
      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#0c1733]/45" role="dialog" aria-modal="true" onClick={() => !busy && setSheet(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-white px-6 pt-6 pb-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold text-ink">{left ? "다시 참여하시나요?" : "일찍 나가시나요?"}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              {left
                ? "커피챗 자리를 다시 배정합니다. 이미 정해진 자리가 있었다면 그 자리로 가시면 됩니다."
                : "표시하시면 커피챗 자리를 배정하지 않습니다. 이미 커피챗 자리가 정해졌다면 그 자리는 비워 둡니다. 마음이 바뀌시면 다시 참여할게요를 눌러 주세요."}
            </p>
            <div className="mt-5 space-y-2">
              <button type="button" disabled={busy} onClick={submit} className={bigBtn}>
                {left ? "다시 참여할게요" : "일찍 나가요"}
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
