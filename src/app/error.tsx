"use client";

import Link from "next/link";
import { useEffect } from "react";
import { IconAlert, IconDatabase, IconRefresh, IconSettings } from "@/components/icons";
import { LinkButton, Panel, panelClass } from "@/components/ui";

/**
 * 라우트 오류 경계.
 * 서버 컴포넌트에서 예외가 나도 흰 화면 대신 원인·다음 행동을 보여줍니다.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 배포 환경 로그(Vercel Functions)에서 확인할 수 있도록 남깁니다.
    console.error("[xconda] route error:", error);
  }, [error]);

  const message = error?.message || "알 수 없는 오류";

  return (
    <div className="mx-auto max-w-2xl">
      <div className={`${panelClass} p-6`}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/30">
            <IconAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-ink">화면을 불러오지 못했습니다</h1>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              일시적인 오류일 수 있습니다. 다시 시도해도 같은 문제가 계속되면 아래 원인을 확인하세요.
            </p>
          </div>
        </div>

        <pre className="mt-4 overflow-x-auto rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 font-mono text-xs leading-5 text-rose-100">
          {message}
          {error?.digest ? `\n(digest: ${error.digest})` : ""}
        </pre>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-primary-strong sm:min-h-9"
          >
            <IconRefresh className="h-3.5 w-3.5" />
            다시 시도
          </button>
          <LinkButton href="/" variant="secondary">
            대시보드로
          </LinkButton>
          <LinkButton href="/settings" variant="ghost">
            <IconSettings className="h-3.5 w-3.5" />
            설정
          </LinkButton>
        </div>

        <div className="mt-6 border-t border-line/70 pt-5">
          <p className="flex items-center gap-2 text-xs font-semibold text-ink-2">
            <IconDatabase className="h-3.5 w-3.5 text-emerald-300" />
            자주 발생하는 원인
          </p>
          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted">
            <li>
              · <code className="rounded bg-surface-2 px-1 font-mono">DATABASE_URL</code> 미설정 또는 연결 실패 —
              Supabase 연결 문자열을 확인하세요.
            </li>
            <li>
              · 마이그레이션 미실행 — <code className="rounded bg-surface-2 px-1 font-mono">supabase/migrations</code>의
              SQL을 Supabase SQL Editor에서 실행하세요. (누락된 <code className="rounded bg-surface-2 px-1 font-mono">settings</code>
              컬럼은 서버가 한 번 자동 복구를 시도합니다. 복구 권한이 없으면 서버 로그의 경고를 확인하세요.)
            </li>
            <li>
              · Notion/Gemini 시크릿 만료 — Vercel 환경변수를 갱신한 뒤 재배포하세요.
            </li>
          </ul>
          <p className="mt-3 text-xs text-faint">
            참고 문서:{" "}
            <Link className="text-emerald-300 hover:underline" href="/settings">
              설정
            </Link>{" "}
            · <span className="font-mono">XCONDA_SETUP.md</span> ·{" "}
            <span className="font-mono">VERCEL_DEPLOY.md</span>
          </p>
        </div>
      </div>
    </div>
  );
}
