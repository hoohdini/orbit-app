import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import Toaster from "@/components/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// 한글 글꼴. 외부 CDN 의 CSS @import(모든 굵기, 화면 그리기를 막음) 대신 쓰는 굵기 3개만 앱에 넣어 미리 불러온다(10/21 속도 개선).
// 파일은 npm spoqa-han-sans 3.3.0 의 Subset/SpoqaHanSansNeo. 라이선스는 public/fonts/spoqa/LICENSE.txt(OFL)
const spoqa = localFont({
  src: [
    { path: "../public/fonts/spoqa/SpoqaHanSansNeo-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/spoqa/SpoqaHanSansNeo-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/spoqa/SpoqaHanSansNeo-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-spoqa",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The ORBIT",
  description: "2026 DSL Gathering Night: The ORBIT",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${spoqa.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
