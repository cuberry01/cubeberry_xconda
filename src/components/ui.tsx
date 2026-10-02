import type { ReactNode } from "react";
import Link from "next/link";
import { IconAlert, IconArrowRight, IconCheckCircle, IconInfo, IconSearch, IconExternal } from "./icons";

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
  footer,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  footer?: ReactNode;
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
      {footer && <div className="border-t border-line/70 px-5 py-3">{footer}</div>}
    </section>
  );
}

/** 제목 + 설명만 있는 소형 섹션 구분자 (폼 내부 그룹화용) */
export function SectionHeading({
  title,
  description,
  actions,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-2 ${className}`}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── 폼 ──────────────────────────────────────────────────── */

/**
 * 라벨 + 입력 + 힌트를 한 묶음으로 렌더링합니다.
 * 라벨은 항상 보이게 두고(플레이스홀더 대체 금지), `htmlFor`로 입력과 연결합니다.
 */
export function Field({
  htmlFor,
  label,
  hint,
  required,
  optional,
  children,
  className = "",
}: {
  htmlFor?: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  /** "(선택)" 표기를 자동으로 붙입니다 */
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={labelClass} htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="text-rose-300" aria-hidden="true">
            {" "}
            *
          </span>
        )}
        {optional && <span className="font-normal text-faint"> (선택)</span>}
      </label>
      {children}
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

/**
 * GET 폼 기반 검색. JS 없이 동작하고 결과 URL을 공유할 수 있습니다.
 * `hidden`으로 현재 필터/정렬 상태를 그대로 유지합니다.
 */
export function SearchForm({
  action,
  paramName = "q",
  defaultValue = "",
  placeholder = "검색어",
  submitLabel = "검색",
  hidden = {},
  className = "",
}: {
  action: string;
  paramName?: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
  hidden?: Record<string, string | undefined>;
  className?: string;
}) {
  return (
    <form method="get" action={action} role="search" className={`flex w-full items-center gap-2 sm:max-w-sm ${className}`}>
      {Object.entries(hidden)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <div className="relative min-w-0 flex-1">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          name={paramName}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
          className={`${inputClass} pl-9`}
          aria-label={placeholder}
        />
      </div>
      <button type="submit" className={`${BUTTON_BASE} ${BUTTON_SIZE.sm} ${BUTTON_VARIANTS.secondary} shrink-0`}>
        {submitLabel}
      </button>
      {defaultValue && (
        <Link
          href={action}
          className={`${BUTTON_BASE} ${BUTTON_SIZE.sm} ${BUTTON_VARIANTS.ghost} shrink-0`}
          aria-label="검색 조건 초기화"
        >
          초기화
        </Link>
      )}
    </form>
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

/* ── 필터 칩 (서버 렌더 링크) ─────────────────────────────── */

export interface FilterChipItem {
  href: string;
  label: ReactNode;
  count?: number;
  active: boolean;
}

/**
 * 목록 상단의 상태 필터. JS 없이 동작하도록 전부 링크(<a>)로 렌더링합니다.
 * 선택 상태는 `aria-current="true"`로도 노출됩니다.
 */
export function FilterChips({
  items,
  ariaLabel = "목록 필터",
  className = "",
}: {
  items: FilterChipItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {items.map((f) => (
        <Link
          key={f.href}
          href={f.href}
          aria-current={f.active ? "true" : undefined}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition-colors duration-150 ${
            f.active
              ? "bg-primary/15 text-emerald-300 ring-primary/30"
              : "bg-surface-2/50 text-muted ring-line/80 hover:text-ink"
          }`}
        >
          {f.label}
          {f.count !== undefined && <span className="font-mono text-[11px] text-faint">{f.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/* ── 콜아웃 ──────────────────────────────────────────────── */

const CALLOUT_TONES = {
  info: {
    wrap: "border-sky-400/30 bg-sky-400/10",
    title: "text-sky-100",
    body: "text-sky-50/80",
    icon: "text-sky-300",
    Icon: IconInfo,
  },
  ok: {
    wrap: "border-primary/30 bg-primary/10",
    title: "text-emerald-100",
    body: "text-emerald-50/80",
    icon: "text-emerald-300",
    Icon: IconCheckCircle,
  },
  warn: {
    wrap: "border-amber-400/30 bg-amber-400/10",
    title: "text-amber-100",
    body: "text-amber-50/80",
    icon: "text-amber-300",
    Icon: IconAlert,
  },
  danger: {
    wrap: "border-rose-400/30 bg-rose-500/10",
    title: "text-rose-100",
    body: "text-rose-50/80",
    icon: "text-rose-300",
    Icon: IconAlert,
  },
} as const;

export type CalloutTone = keyof typeof CALLOUT_TONES;

/** 정적 안내 박스 (결과 알림은 Flash 컴포넌트 사용) */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = CALLOUT_TONES[tone];
  const Icon = t.Icon;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm ${t.wrap} ${className}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.icon}`} />
      <div className="min-w-0 flex-1">
        {title && <p className={`font-semibold ${t.title}`}>{title}</p>}
        {children && <div className={`text-xs leading-5 ${title ? "mt-1" : ""} ${t.body}`}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
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
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  icon?: ReactNode;
  footer?: ReactNode;
  /** 값이 다른 화면으로 이어질 때 카드 전체를 링크로 만듭니다 */
  href?: string;
}) {
  const t = STAT_TONES[tone];
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          {icon}
          {label}
        </span>
        <span className="flex items-center gap-1.5">
          {/* 색만으로 상태를 전달하지 않도록 값 텍스트가 항상 함께 표시됩니다 */}
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
          {href && <IconArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden="true" />}
        </span>
      </div>
      <div className={`mt-2 text-lg font-bold tracking-tight ${t.value}`}>{value}</div>
      {hint && <p className="mt-1.5 break-words text-xs leading-5 text-muted">{hint}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`${panelClass} block p-4 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2/40`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={`${panelClass} p-4`}>{inner}</div>;
}

/* ── 진행률 ──────────────────────────────────────────────── */

const METER_TONES = {
  ok: "bg-primary",
  info: "bg-sky-400",
  warn: "bg-amber-400",
  danger: "bg-rose-400",
} as const;

export function Meter({
  value,
  max = 100,
  tone = "ok",
  label,
  hint,
}: {
  value: number;
  max?: number;
  tone?: keyof typeof METER_TONES;
  label: ReactNode;
  hint?: ReactNode;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="font-mono text-xs text-ink-2">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === "string" ? label : undefined}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div className={`h-full rounded-full ${METER_TONES[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="mt-1.5 text-xs leading-5 text-muted">{hint}</p>}
    </div>
  );
}

/* ── 정의 목록 ───────────────────────────────────────────── */

/** 라벨/값 쌍을 나열합니다. 값이 길면 줄바꿈되도록 최소 너비를 보장합니다. */
export function KeyValue({
  items,
  className = "",
}: {
  items: { label: ReactNode; value: ReactNode; mono?: boolean }[];
  className?: string;
}) {
  return (
    <dl className={`divide-y divide-line/70 ${className}`}>
      {items.map((it, i) => (
        <div key={i} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
          <dt className="text-xs font-medium text-muted">{it.label}</dt>
          <dd className={`min-w-0 max-w-full break-words text-right text-xs text-ink-2 ${it.mono ? "font-mono" : ""}`}>
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
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
