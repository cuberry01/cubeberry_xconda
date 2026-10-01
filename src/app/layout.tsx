import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppChrome } from "@/components/AppChrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xconda | AI 소식 수집·요약",
  description: "X 게시물을 수집하고 AI로 요약해 Notion과 공지로 발행하는 Xconda 대시보드입니다.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
