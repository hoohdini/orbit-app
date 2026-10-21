"use client";
// 공용 QR 스캐너. html5-qrcode 로 뒷카메라를 연다. 명함·포스터 화면이 같이 쓴다.
// 읽은 문자열을 onDecode 로 그대로 넘긴다. 종류 구분(docs/QR_FORMAT.md)은 화면이 한다.
// 카메라는 HTTPS(또는 localhost)에서만 열린다. 권한이 없으면 onDenied 를 부른다.
import { useEffect, useRef, useState } from "react";

type Props = {
  onDecode: (text: string) => void;
  onDenied?: (reason: string) => void;
  paused?: boolean; // true 면 읽어도 onDecode 를 부르지 않는다(결과 처리 중)
  cooldownMs?: number; // 같은 문자열 연속 인식 무시 간격
};

const REGION_ID = "orbit-qr-region";

export default function QrScanner({ onDecode, onDenied, paused = false, cooldownMs = 2000 }: Props) {
  const [status, setStatus] = useState<"starting" | "running" | "denied">("starting");
  const pausedRef = useRef(paused);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const onDecodeRef = useRef(onDecode);
  const onDeniedRef = useRef(onDenied);
  useEffect(() => {
    pausedRef.current = paused;
    onDecodeRef.current = onDecode;
    onDeniedRef.current = onDenied;
  }, [paused, onDecode, onDenied]);

  useEffect(() => {
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const s = new Html5Qrcode(REGION_ID, { verbose: false });
        scanner = s;
        await s.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.63, height: Math.min(w, h) * 0.63 }) },
          (text) => {
            if (pausedRef.current) return;
            const now = Date.now();
            if (text === lastRef.current.text && now - lastRef.current.at < cooldownMs) return;
            lastRef.current = { text, at: now };
            onDecodeRef.current(text);
          },
          () => {},
        );
        if (!cancelled) setStatus("running");
      } catch (e) {
        if (cancelled) return;
        setStatus("denied");
        onDeniedRef.current?.(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      const s = scanner;
      if (s) {
        s.stop()
          .catch(() => {})
          .finally(() => {
            try {
              s.clear();
            } catch {}
          });
      }
    };
  }, [cooldownMs]);

  // 피그마 QR 스캔 화면의 원(280) 안에 꽉 차게 그린다. 바깥 장식은 화면(components/figma/Eclipse)이 그린다
  return (
    <div className="relative size-full bg-black [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover [&_#qr-shaded-region]:!hidden">
      <div id={REGION_ID} className="size-full" />
      {status !== "running" && (
        <p className="absolute inset-0 flex items-center justify-center px-8 text-center text-xs text-muted">
          {status === "starting" ? "카메라를 여는 중" : "카메라를 열 수 없습니다. 권한을 허용하거나 아래에서 이름으로 찾아 주세요"}
        </p>
      )}
    </div>
  );
}
