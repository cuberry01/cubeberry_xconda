"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { DesktopNav, MobileNav } from "./Nav";

export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <>
      {/* 키보드 사용자를 위한 본문 바로가기 (포커스 시에만 표시) */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
      >
        본문으로 건너뛰기
      </a>

      <header className="sticky top-0 z-20 border-b border-line/80 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 rounded-xl">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 font-mono text-base font-bold text-emerald-950 shadow-lg shadow-emerald-500/20">
              𝕏
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-bold tracking-tight text-ink">Xconda</span>
              <span className="mt-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
                AI news pipeline
              </span>
            </span>
          </Link>
          <DesktopNav />
        </div>
      </header>

      <main id="content" className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 sm:py-8 sm:pb-12">
        {children}
      </main>

      <footer className="mx-auto hidden w-full max-w-6xl px-4 pb-8 text-xs text-faint sm:block">
        X 게시물 → 본문 추출 → Gemini 요약 → Notion → 공지. 설정 방법은{" "}
        <span className="font-mono text-muted">XCONDA_SETUP.md</span> 참고.
      </footer>

      <MobileNav />
    </>
  );
}
