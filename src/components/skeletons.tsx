import { panelClass } from "./ui";

/* ── 로딩 스켈레톤 ─────────────────────────────────────────
   라우트 이동 중 빈 화면 대신 실제 레이아웃과 같은 골격을 보여줍니다.
   (디자인 시스템: 무한 스피너만 있는 로딩 금지 → 구조를 미리 노출) */

/** 단일 블록. 크기는 className으로 지정합니다. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`motion-safe:animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}

function HeaderSkeleton() {
  return (
    <div className="mb-6">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-3 h-7 w-40" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
    </div>
  );
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${panelClass} p-4`}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-5 w-24" />
          <Skeleton className="mt-2.5 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

function RowSkeleton() {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="w-full max-w-xl space-y-2.5">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-xl" />
          <Skeleton className="h-9 w-20 rounded-xl" />
        </div>
      </div>
    </li>
  );
}

/** 대시보드(/): 헤더 + 상태 카드 5 + 좌측 목록/우측 설정 */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="불러오는 중">
      <span className="sr-only">불러오는 중…</span>
      <HeaderSkeleton />
      <CardsSkeleton count={5} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className={`${panelClass} p-5`}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-11 w-full rounded-xl" />
            <Skeleton className="mt-3 h-11 w-full rounded-xl" />
            <Skeleton className="mt-4 ml-auto h-9 w-32 rounded-xl" />
          </div>
          <div className={panelClass}>
            <div className="border-b border-line/70 px-5 py-4">
              <Skeleton className="h-4 w-28" />
            </div>
            <ul className="divide-y divide-line/70">
              {Array.from({ length: 4 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </ul>
          </div>
        </div>
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={`${panelClass} p-5`}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-11 w-full rounded-xl" />
              <Skeleton className="mt-3 h-11 w-full rounded-xl" />
              <Skeleton className="mt-3 h-11 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 표 중심 화면(구독자, 발송 기록) */
export function TableSkeleton({ cards = 3, rows = 6 }: { cards?: number; rows?: number }) {
  return (
    <div role="status" aria-label="불러오는 중">
      <span className="sr-only">불러오는 중…</span>
      <HeaderSkeleton />
      <CardsSkeleton count={cards} />
      <div className={panelClass}>
        <div className="border-b border-line/70 px-5 py-4">
          <Skeleton className="h-4 w-32" />
        </div>
        <ul className="divide-y divide-line/70">
          {Array.from({ length: rows }).map((_, i) => (
            <li key={i} className="flex items-center gap-4 px-5 py-3.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="hidden h-3.5 w-24 sm:block" />
              <Skeleton className="h-6 w-14 rounded-full" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 폼 중심 화면(설정) */
export function FormSkeleton() {
  return (
    <div role="status" aria-label="불러오는 중">
      <span className="sr-only">불러오는 중…</span>
      <HeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`${panelClass} p-5 lg:col-span-2`}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mb-6">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="mt-2.5 h-11 w-full rounded-xl" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ))}
        </div>
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={`${panelClass} p-5`}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 공개 공지 페이지 */
export function NoticesSkeleton() {
  return (
    <div role="status" aria-label="불러오는 중" className="mx-auto max-w-3xl">
      <span className="sr-only">불러오는 중…</span>
      <div className="mb-8 flex flex-col items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-2xl" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`${panelClass} p-6`}>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="mt-3 h-5 w-4/5" />
            <Skeleton className="mt-3 h-3.5 w-full" />
            <Skeleton className="mt-2 h-3.5 w-5/6" />
            <Skeleton className="mt-4 aspect-[16/9] w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
