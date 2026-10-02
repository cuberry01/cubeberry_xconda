import type { ReactNode } from "react";
import { IconExternal } from "./icons";

/* ── 공통 클래스 ─────────────────────────────────────────────
   화면마다 반복되던 긴 Tailwind 문자열을 한곳에서 관리합니다.
   모든 색은 globals.css의 디자인 토큰(라이트/다크 대비 검증済)만 사용합니다. */

export const panelClass =
  "rounded-2xl border border-line/80 bg-surface shadow-[0_24px_50px_-42px_rgba(0,0,0,0.95)]";

export const inputClass =
  "min-h-11 w-full rounded-xl border border-line-strong/80 bg-canvas/70 px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors duration-150 hover:border-line-strong focus:border-primary";

export const textareaClass = `${inputClass} h-auto`;

export const labelClass = "mb-1.5 block text-sm font-medium text-ink-2";
export const hintClass = "mt-1.5 text-xs leading-5 text-muted";

export const BUTTON_BASE =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl font-semibold transition-[background-color,color,opacity,transform] duration-150 disabled:cursor-wait disabled:opacity-60 motion-safe:active:translate-y-px";

export const BUTTON_SIZE = {
  md: "min-h-11 px-3.5 text-sm sm:min-h-9",
  sm: "min-h-11 px-2.5 text-xs sm:min-h-8",
} as const;

export const BUTTON_VARIANTS = {
  primary: "bg-primary text-on-primary hover:bg-primary-strong",
  secondary: "bg-surface-2 text-ink ring-1 ring-line-strong/70 hover:bg-surface-3",
  danger: "bg-rose-500/10 text-rose-200 ring-1 ring-rose-400/40 hover:bg-rose-500/20",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZE;

/** 링크를 버튼과 동일한 모양으로 렌더링 */
export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "md",
  external = false,
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  external?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={`${BUTTON_BASE} ${BUTTON_SIZE[size]} ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
      {external && <IconExternal className="h-3.5 w-3.5 opacity-70" />}
    </a>
  );
}

/* ── 패널 ────────────────────────────────────────────────── */

export function Panel({
  title,
  description,
  icon,
  actions,
  children,
  className = "",
  bodyClassName = "p-5",
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`${panelClass} ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                {icon}
                {title}
              </h2>
            )}
            {description && <p className="mt-1.5 max-w-xl text-xs leading-5 text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ── 배지 ────────────────────────────────────────────────── */

const BADGE_TONES = {
  neutral: "bg-surface-2 text-ink-2 ring-line-strong/50",
  ok: "bg-primary/15 text-emerald-300 ring-primary/30",
  info: "bg-sky-400/15 text-sky-300 ring-sky-400/30",
  accent: "bg-violet-400/15 text-violet-300 ring-violet-400/30",
  warn: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  danger: "bg-rose-400/15 text-rose-300 ring-rose-400/30",
  muted: "bg-surface-2 text-muted ring-line/80",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ── 상태 카드 ───────────────────────────────────────────── */

const STAT_TONES = {
  ok: { value: "text-emerald-300", dot: "bg-emerald-400" },
  warn: { value: "text-amber-300", dot: "bg-amber-400" },
  danger: { value: "text-rose-300", dot: "bg-rose-400" },
  info: { value: "text-sky-300", dot: "bg-sky-400" },
  off: { value: "text-muted", dot: "bg-slate-500" },
  neutral: { value: "text-ink", dot: "bg-slate-400" },
} as const;

export type StatTone = keyof typeof STAT_TONES;

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  footer,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  icon?: ReactNode;
  footer?: ReactNode;
}) {
  const t = STAT_TONES[tone];
  return (
    <div className={`${panelClass} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          {icon}
          {label}
        </span>
        {/* 색만으로 상태를 전달하지 않도록 값 텍스트가 항상 함께 표시됩니다 */}
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
      </div>
      <div className={`mt-2 text-lg font-bold tracking-tight ${t.value}`}>{value}</div>
      {hint && <p className="mt-1.5 break-words text-xs leading-5 text-muted">{hint}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

/* ── 빈 상태 ─────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong/50 px-6 py-12 text-center">
      {icon && (
        <span className="mb-1 grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-muted">{icon}</span>
      )}
      <p className="text-sm font-semibold text-ink-2">{title}</p>
      {description && <p className="max-w-md text-xs leading-5 text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ── 페이지 헤더 ─────────────────────────────────────────── */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-faint">{eyebrow}</p>
        )}
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
