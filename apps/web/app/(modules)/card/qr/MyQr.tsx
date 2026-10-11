"use client";
// 내 명함 QR(피그마 iPhone 16 - 13). 개기일식 원 가운데 QR. 상대가 찍으면 서로 명함을 주고받는다.
// 웹은 화면 밝기를 못 바꾸므로 QR 은 흰 바탕으로 그리고 화면 꺼짐 방지(Wake Lock)만 건다.
// 피그마의 이름으로 찾기 링크는 카메라 대체 경로라 QR 스캔 화면으로 옮겼다(10/11 검토).
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/client";
import Eclipse from "@/components/figma/Eclipse";
import DarkScreen from "../DarkScreen";

export default function MyQr() {
  const [payload, setPayload] = useState<string | null>(null);

  useEffect(() => {
    api<{ qr_payload: string }>("/api/card/me").then((r) => r.ok && setPayload(r.data.qr_payload));
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, []);

  return (
    <DarkScreen title="내 명함 QR" close="/card">
      <Eclipse variant="qr" guide={false}>
        <div className="flex size-[190px] items-center justify-center rounded-2xl bg-white">
          {payload ? <QRCodeSVG value={payload} size={168} level="M" /> : <span className="text-xs text-ink-3">불러오는 중</span>}
        </div>
      </Eclipse>
      <p className="mt-[55px] text-center text-[15px] font-medium">내 QR을 상대에게 공유해요</p>
      <p className="mt-2 text-center text-sm text-muted">상대가 찍으면 서로 명함을 주고받아요</p>
    </DarkScreen>
  );
}
