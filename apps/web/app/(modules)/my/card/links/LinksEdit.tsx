"use client";
// 연락처 링크(LinkedIn · GitHub · 이메일 · 그 밖의 링크). 서버가 형식을 고친다(/api/card/settings, 틀리면 400). 공개 범위는 명함 편집에서 정한다
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";
import { LINK_KEYS, type LinkKey } from "@/app/api/card/_lib";
import { bigBtn } from "../../ui";

const label: Record<LinkKey, string> = { linkedin: "LinkedIn", github: "GitHub", email: "이메일", url: "그 밖의 링크" };
const hint: Record<LinkKey, string> = { linkedin: "linkedin.com/in/…", github: "github.com/…", email: "name@example.com", url: "https://…" };

export default function LinksEdit() {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<LinkKey, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ links: Record<string, string> }>("/api/my/profile").then((r) => {
      const l = r.ok ? r.data.links : {};
      setDraft({ linkedin: l.linkedin ?? "", github: l.github ?? "", email: l.email ?? "", url: l.url ?? "" });
    });
  }, []);

  if (!draft) return <Loading />;

  async function save() {
    setBusy(true);
    setError(null);
    const r = await api("/api/card/settings", { json: { links: draft } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.push("/my/card");
  }

  return (
    <main className="space-y-4 px-5 py-7">
      {LINK_KEYS.map((k) => (
        <label key={k} className="block">
          <span className="text-sm font-bold text-navy">{label[k]}</span>
          <input value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} placeholder={hint[k]} className="mt-1.5 h-12 w-full rounded-2xl border border-navy px-4 text-[15px] text-ink outline-none placeholder:text-ink-3" />
        </label>
      ))}
      {error && <p className="text-sm text-[#d93025]">{error}</p>}
      <button type="button" onClick={save} disabled={busy} className={bigBtn}>
        {busy ? "저장 중" : "저장하기"}
      </button>
    </main>
  );
}
