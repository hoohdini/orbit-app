// 사용설명서(피그마 마이페이지 -사용설명서). 본문은 sections.ts
import MyShell from "../MyShell";
import { sections } from "./sections";

export default function GuidePage() {
  return (
    <MyShell title="사용설명서" back="/my/info">
      <main className="px-5 py-7">
        <div className="space-y-4 rounded-2xl border border-navy px-5 py-5">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-[15px] font-bold text-navy">{s.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink">{s.body}</p>
            </section>
          ))}
        </div>
      </main>
    </MyShell>
  );
}
