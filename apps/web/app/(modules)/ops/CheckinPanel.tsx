"use client";
// 체크인 관리. 참가자 전원을 보여 주고 이름으로 찾아 수동 체크인(지연 표시)한다. 워크인 추가와 숫자 재발급도 여기서 한다.
// 첫 로그인이 곧 체크인이라 보통은 저절로 되고, 폰이 안 되는 사람만 여기서 처리한다.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type P = {
  id: string;
  display_name: string;
  affiliation: string | null;
  role: string;
  cohort: number | null;
  is_host: boolean;
  is_admin: boolean;
  consented: boolean;
  has_sid: boolean;
  checked_at: string | null;
  is_late: boolean;
};

const ROLE: Record<string, string> = { student: "재학생", alumni: "졸업생", professor: "교수", staff: "운영진", other: "기타" };

function hm(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function CheckinPanel() {
  const [people, setPeople] = useState<P[] | null>(null);
  const [q, setQ] = useState("");
  const [late, setLate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ participants: P[] }>("/api/ops/participants");
    if (r.ok) {
      setPeople(r.data.participants);
      setError(null);
    } else setError(r.message);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  async function checkin(p: P) {
    setBusy(p.id);
    setNotice(null);
    try {
      const r = await api<{ checked_at: string; already: boolean }>("/api/ops/checkin", { json: { participant_id: p.id, is_late: late } });
      if (!r.ok) return setError(r.message);
      setNotice(r.data.already ? `${p.display_name} 님은 이미 ${hm(r.data.checked_at)} 에 체크인돼 있다` : `${p.display_name} 님 체크인${late ? " (지연)" : ""}`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function resetPin(p: P) {
    setBusy(p.id);
    setNotice(null);
    try {
      const r = await api<{ pin: string }>("/api/ops/reset-pin", { json: { participant_id: p.id } });
      if (!r.ok) return setError(r.message);
      setNotice(`${p.display_name} 님의 새 숫자 4자리: ${r.data.pin} (지금만 보인다. 본인에게 바로 알려 준다)`);
    } finally {
      setBusy(null);
    }
  }

  const list = (people ?? []).filter((p) => {
    const s = q.trim();
    return !s || p.display_name.includes(s) || (p.affiliation ?? "").includes(s);
  });
  const checked = (people ?? []).filter((p) => p.checked_at).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 또는 소속으로 찾기"
          className="w-64 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} /> 지연 체크인으로 표시
        </label>
        <span className="text-xs text-gray-500">
          체크인 {checked} / {people?.length ?? 0}
        </span>
        <button type="button" onClick={() => setShowAdd((v) => !v)} className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs">
          {showAdd ? "워크인 추가 닫기" : "워크인 추가"}
        </button>
      </div>
      {showAdd && <WalkinForm onAdded={(msg) => { setNotice(msg); setShowAdd(false); load(); }} />}
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
      {error && <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{error}</p>}
      {!people ? (
        <p className="text-sm text-gray-500">불러오는 중</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">소속 · 구분</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">체크인</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-medium">{p.display_name}</span>
                    {p.is_host && <span className="ml-1 rounded bg-purple-100 px-1 text-[10px] text-purple-800">호스트</span>}
                    {p.is_admin && <span className="ml-1 rounded bg-gray-900 px-1 text-[10px] text-white">운영자</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {p.affiliation ?? "-"} · {ROLE[p.role] ?? p.role}
                    {p.cohort ? ` · ${p.cohort}기` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {p.consented ? "동의" : "동의 전"} · {p.has_sid ? "주소 있음" : "주소 없음"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {p.checked_at ? (
                      <span className="text-green-700">
                        {hm(p.checked_at)}
                        {p.is_late ? " 지연" : ""}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {!p.checked_at && (
                      <button type="button" disabled={busy !== null} onClick={() => checkin(p)} className="rounded-lg bg-black px-2 py-1 text-xs font-semibold text-white disabled:bg-gray-300">
                        체크인
                      </button>
                    )}
                    <button type="button" disabled={busy !== null} onClick={() => resetPin(p)} className="ml-1 rounded-lg border border-gray-300 px-2 py-1 text-xs">
                      숫자 재발급
                    </button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">
                    없다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WalkinForm({ onAdded }: { onAdded: (msg: string) => void }) {
  const [name, setName] = useState("");
  const [aff, setAff] = useState("");
  const [role, setRole] = useState("student");
  const [cohort, setCohort] = useState("");
  const [host, setHost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ participant: { id: string; display_name: string }; pin: string; seat: { table_no: number; seat_no: number } | null }>("/api/ops/add-participant", {
        json: { display_name: name.trim(), affiliation: aff.trim() || undefined, role, cohort: cohort ? Number(cohort) : undefined, is_host: host },
      });
      if (!r.ok) return setError(r.message);
      onAdded(`${r.data.participant.display_name} 님 추가. 숫자 4자리: ${r.data.pin} (지금만 보인다. 본인에게 바로 알려 준다). ${r.data.seat ? `자리: ${r.data.seat.table_no}번 테이블 ${r.data.seat.seat_no}번 좌석(인원이 가장 적은 테이블 끝). ` : ""}주소는 체크인 마감 계산 때 붙는다`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">사전 등록 없이 온 사람. 이름과 소속만 넣고 프로필은 본인이 나중에 채운다</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" maxLength={20} className="w-32 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
        <input value={aff} onChange={(e) => setAff(e.target.value)} placeholder="소속" maxLength={40} className="w-44 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm">
          {Object.entries(ROLE).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input value={cohort} onChange={(e) => setCohort(e.target.value.replace(/\D/g, ""))} placeholder="기수" className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={host} onChange={(e) => setHost(e.target.checked)} /> 호스트
        </label>
        <button type="button" disabled={busy || name.trim().length === 0} onClick={submit} className="rounded-lg bg-black px-3 py-1 text-xs font-semibold text-white disabled:bg-gray-300">
          추가
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
