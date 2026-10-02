import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppChrome } from "@/components/AppChrome";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Xconda | AI 소식 수집·요약",
    template: "%s | Xconda",
  },
  description: "X 게시물을 수집하고 AI로 요약해 Notion과 공지로 발행하는 Xconda 대시보드입니다.",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Router에서는 루트 레이아웃의 <link>가 모든 페이지에 적용됩니다.
            next/font/google은 빌드 시 외부 네트워크가 필요해 오프라인 빌드를 깨뜨립니다. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
