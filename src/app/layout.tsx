import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppChrome } from "@/components/AppChrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Google Vids | 업무용 AI 동영상 제작 도구",
  description: "Gemini 기반의 간편하고 협업 가능한 동영상 제작 도구, Google Vids를 만나보세요.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
