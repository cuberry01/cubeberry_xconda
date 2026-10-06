import type { ReactNode } from "react";

import { CopyButton } from "@/components/CopyButton";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import {
  IconAlert,
  IconCheckCircle,
  IconChevronDown,
  IconClock,
  IconDatabase,
  IconExternal,
  IconHistory,
  IconImage,
  IconInbox,
  IconLink,
  IconMegaphone,
  IconPlay,
  IconRefresh,
  IconSend,
  IconSettings,
  IconSparkles,
  IconTrash,
  IconUsers,
} from "@/components/icons";
import {
  Badge,
  Callout,
  EmptyState,
  FilterChips,
  KeyValue,
  LinkButton,
  PageHeader,
  Panel,
  SearchForm,
  StatCard,
  hintClass,
  inputClass,
  labelClass,
  textareaClass,
  type BadgeTone,
} from "@/components/ui";
import { db } from "@/db";
import { xAccounts } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { elapsedMs, formatKst, formatRelativeKst } from "@/lib/time";
import { getXcondaConfig, missingConfig } from "@/lib/xconda/config";
import { getImageStorageBucketName, getImageStorageStatus } from "@/lib/xconda/image-storage";
import { getDatabaseInfo, queryItemsUpTo } from "@/lib/xconda/notion";
import { FAILURE_STATUSES, STATUS_LABELS, type XItem, type XStatus } from "@/lib/xconda/types";
import { asc } from "drizzle-orm";
import {
  addAccountAction,
  addMissingPropertiesAction,
  checkAccountAction,
  createNotionDbAction,
  deleteAccountAction,
  ignoreAction,
  ingestAction,
  publishAction,
  resummarizeAction,
  retryAction,
  runTickAction,
  saveXSettingsAction,
  toggleAccountAction,
} from "./actions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{
  msg?: string;
  err?: string;
  status?: string;
  q?: string;
  sort?: string;
  limit?: string;
}>;

/* ── 목록 옵션 ─────────────────────────────────────────────── */

/** 한 번에 Notion에서 가져오는 건수 (Notion API 페이지 상한) */
const PAGE_SIZE = 100;
/** "더 보기"로 늘릴 수 있는 최대 조회 건수 */
const MAX_ITEMS = 500;
/** 자동 실행이 이보다 오래 멈춰 있으면 경고 */
const STALE_TICK_MS = 6 * 60 * 60 * 1000;
/** 실패 항목 카드에서 보여줄 원문 미리보기 길이 */
const ORIGINAL_PREVIEW = 700;

const STATUS_TONE: Record<XStatus, BadgeTone> = {
  NEW: "neutral",
  EXTRACTED: "info",
  SUMMARIZED: "accent",
  READY: "warn",
  PUBLISHED: "ok",
  EXTRACT_FAILED: "danger",
  AI_FAILED: "danger",
  PUBLISH_FAILED: "danger",
  IGNORED: "muted",
};

function StatusBadge({ status }: { status: XStatus | "" }) {
  if (!status) return <Badge tone="muted">미상</Badge>;
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}

/** 목록 필터 — 서버 렌더 링크라 JS 없이 동작합니다. */
const FILTERS = [
  { key: "all", label: "전체" },
  { key: "pending", label: "처리 대기" },
  { key: "published", label: "게시됨" },
  { key: "failed", label: "실패" },
  { key: "ignored", label: "제외" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function matchesFilter(status: XStatus | "", key: FilterKey) {
  if (key === "all") return true;
  if (key === "published") return status === "PUBLISHED";
  if (key === "failed") return FAILURE_STATUSES.includes(status as XStatus);
  if (key === "ignored") return status === "IGNORED";
  return status !== "PUBLISHED" && status !== "IGNORED" && !FAILURE_STATUSES.includes(status as XStatus);
}

/** 정렬 — 전부 서버에서 처리하고 URL로 공유할 수 있습니다. */
const SORTS = [
  { key: "new", label: "최신순", hint: "Notion에 들어온 순서" },
  { key: "old", label: "오래된순", hint: "먼저 수집된 항목부터" },
  { key: "date", label: "발행일순", hint: "원문 게시 날짜 기준" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

function sortItems(items: XItem[], key: SortKey): XItem[] {
  const time = (d: Date | null) => (d ? d.getTime() : Number.NEGATIVE_INFINITY);
  const sorted = [...items];
  if (key === "old") {
    sorted.sort((a, b) => {
      const at = a.createdAt ? a.createdAt.getTime() : Number.POSITIVE_INFINITY;
      const bt = b.createdAt ? b.createdAt.getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
  } else if (key === "date") {
    sorted.sort((a, b) => time(b.sourceDate) - time(a.sourceDate) || time(b.createdAt) - time(a.createdAt));
  } else {
    sorted.sort((a, b) => time(b.createdAt) - time(a.createdAt));
  }
  return sorted;
}

/** 제목·요약·작성자·카테고리·태그 검색 (대소문자 무시) */
function matchesQuery(item: XItem, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const haystack = [item.title, item.summary, item.author, item.category, item.tags.join(" ")]
    .join("\n")
    .toLowerCase();
  return haystack.includes(needle);
}

/** 상태 배지에 이어 붙이는 "다음 행동" 안내 — 지금 무엇을 해야 하는지 한 줄로 */
const STATUS_NEXT: Record<XStatus | "", string> = {
  "": "Notion에서 Status 속성을 확인하세요 (선택 값이 비어 있음).",
  NEW: "다음 자동 실행(15분 이내)에서 본문 추출과 요약이 진행됩니다.",
  EXTRACTED: "본문 확보 완료 — 다음 자동 실행에서 Gemini 요약이 진행됩니다.",
  SUMMARIZED: "요약 완료 — 내용을 확인하고 '게시'를 누르면 공지에 올라갑니다.",
  READY: "발행 대기 — '게시'를 누르면 공지와 뉴스레터 대기열에 들어갑니다.",
  PUBLISHED: "게시 완료 — /notices 공지 페이지에 반영되었습니다.",
  EXTRACT_FAILED: "본문 추출 실패 — 비공개·삭제된 게시물일 수 있습니다. 본문을 붙여넣고 재요약하세요.",
  AI_FAILED: "Gemini 요약 실패 — API 키·할당량을 확인한 뒤 '다시 처리'를 누르세요.",
  PUBLISH_FAILED: "게시 실패 — Notion 권한/속성을 확인한 뒤 '다시 처리'를 누르세요.",
  IGNORED: "제외됨 — 중복·오래됨·관련성 없음으로 판단되어 종료된 항목입니다.",
};

function isFailureStatus(status: XStatus | "") {
  return FAILURE_STATUSES.includes(status as XStatus);
}

/** 오류 메시지에 감춰진 cause(drizzle/pg의 실제 원인)까지 붙여 원인 파악을 돕는다 */
function errorText(e: unknown): string {
  const base = e instanceof Error ? e.message : String(e);
  const cause = e instanceof Error ? (e as { cause?: unknown }).cause : undefined;
  if (!cause) return base;
  return `${base} — ${cause instanceof Error ? cause.message : String(cause)}`;
}

/** 체크박스 + 제목 + 설명 (터치 타깃 44px 이상) */
function CheckRow({
  name,
  defaultChecked,
  title,
  description,
}: {
  name: string;
  defaultChecked: boolean;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line/70 bg-canvas/40 px-3 py-3 transition-colors duration-150 hover:border-line-strong">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-emerald-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-2">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">{description}</span>
      </span>
    </label>
  );
}

/** 접히는 상세 블록 (요약 전문 / 공지문 / 원문) */
function DetailBlock({ label, children, meta }: { label: string; children: ReactNode; meta?: string }) {
  return (
    <details className="group mt-2 rounded-xl border border-line/70 bg-canvas/40">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted transition-colors duration-150 hover:text-ink">
        <IconChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-150 group-open:rotate-180" />
        {label}
        {meta && <span className="font-mono text-[11px] text-faint">{meta}</span>}
        <span className="ml-auto text-[11px] text-faint group-open:hidden">펼치기</span>
        <span className="ml-auto hidden text-[11px] text-faint group-open:inline">접기</span>
      </summary>
      <div className="border-t border-line/70 px-3 py-2.5 text-xs leading-5 whitespace-pre-wrap text-ink-2">
        {children}
      </div>
    </details>
  );
}

/** 실패 항목 복구 폼 — 본문을 붙여넣으면 추출을 건너뛰고 요약부터 다시 진행 */
function RecoveryForm({ pageId, back }: { pageId: string; back: string }) {
  return (
    <form action={resummarizeAction} className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/5 p-3">
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="back" value={back} />
      <label className="mb-1.5 block text-xs font-semibold text-rose-100" htmlFor={`recover-${pageId}`}>
        본문 직접 붙여넣고 재요약
      </label>
      <textarea
        id={`recover-${pageId}`}
        name="text"
        required
        minLength={20}
        className={`${textareaClass} h-24`}
        placeholder="게시물 본문을 붙여넣으세요 (20자 이상). 추출 단계를 건너뛰고 Gemini 요약부터 진행합니다."
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] leading-4 text-muted">
          X 게시물이 비공개·삭제되어 본문을 가져올 수 없을 때 사용합니다.
        </p>
        <SubmitButton size="sm" variant="danger" pendingText="재요약 중…">
          <IconSparkles className="h-3.5 w-3.5" />
          재요약
        </SubmitButton>
      </div>
    </form>
  );
}

export default async function XcondaPage({ searchParams }: { searchParams: PageParams }) {
  const sp = await searchParams;

  const filterKey: FilterKey = (FILTERS.find((f) => f.key === sp.status)?.key ?? "all") as FilterKey;
  const sortKey: SortKey = (SORTS.find((s) => s.key === sp.sort)?.key ?? "new") as SortKey;
  const query = (sp.q || "").trim();
  const requestedLimit = Number(sp.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.round(requestedLimit), PAGE_SIZE), MAX_ITEMS)
    : PAGE_SIZE;

  /** 현재 검색·필터·정렬·조회 범위를 유지한 URL 만들기 (기본값은 URL에 남기지 않음) */
  const hrefWith = (patch: Partial<Record<"status" | "q" | "sort" | "limit", string | undefined>>) => {
    const merged: Record<string, string | undefined> = {
      status: filterKey === "all" ? undefined : filterKey,
      q: query || undefined,
      sort: sortKey === "new" ? undefined : sortKey,
      limit: limit > PAGE_SIZE ? String(limit) : undefined,
      ...patch,
    };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) usp.set(k, v);
    const qs = usp.toString();
    return qs ? `/?${qs}` : "/";
  };
  const backTo = hrefWith({});

  // DB 미연결/마이그레이션 전에도 설정 안내가 보이도록 먼저 안전하게 읽는다
  let cfg: Awaited<ReturnType<typeof getXcondaConfig>> | null = null;
  let accounts: (typeof xAccounts.$inferSelect)[] = [];
  let xLastTickAt: Date | null = null;
  let xLastTickLog = "";
  let dbError = "";
  try {
    cfg = await getXcondaConfig();
    accounts = await db.select().from(xAccounts).orderBy(asc(xAccounts.id));
    const s = await getSettings();
    xLastTickAt = s.xLastTickAt;
    xLastTickLog = s.xLastTickLog ?? "";
  } catch (e) {
    dbError = errorText(e);
  }

  if (!cfg) {
    return (
      <div>
        <Flash msg={sp.msg} err={sp.err} />
        <PageHeader
          eyebrow="Xconda"
          title="X 수집"
          description="X 게시물을 수집하고 AI로 요약해 Notion과 공지로 발행합니다."
        />
        <Panel
          title="데이터베이스에 연결할 수 없습니다"
          icon={<IconAlert className="h-4 w-4 text-rose-300" />}
          description="아래 두 단계를 마치면 대시보드가 바로 동작합니다."
          bodyClassName="p-5"
        >
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 font-mono text-xs leading-5 text-rose-200">
            {dbError}
          </p>
          <ol className="mt-4 space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-xs text-muted">
                1
              </span>
              <span className="text-ink-2">
                환경변수 <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">DATABASE_URL</code>에
                Supabase 연결 문자열을 설정하세요.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-xs text-muted">
                2
              </span>
              <span className="text-ink-2">
                Supabase SQL Editor에서{" "}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                  supabase/migrations/20260930000000_xconda.sql
                </code>{" "}
                과{" "}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                  supabase/migrations/20261002000000_xconda_ops.sql
                </code>
                을 실행하세요. (자세한 내용은{" "}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">XCONDA_SETUP.md</code>)
              </span>
            </li>
          </ol>
        </Panel>
      </div>
    );
  }

  const missing = missingConfig(cfg);
  const imageStorageStatus = getImageStorageStatus();

  let items: XItem[] = [];
  let itemHasMore = false;
  let dbInfo = null as Awaited<ReturnType<typeof getDatabaseInfo>> | null;
  let notionError = "";
  const notionConfigured = Boolean(cfg.notionToken && cfg.notionDatabaseId);
  if (!missing.some((m) => m.includes("Notion")) && notionConfigured) {
    try {
      dbInfo = await getDatabaseInfo(cfg);
      const page = await queryItemsUpTo(cfg, limit);
      items = page.items;
      itemHasMore = page.hasMore;
    } catch (e) {
      notionError = errorText(e);
    }
  }

  const notionReady = Boolean(notionConfigured && !notionError);
  const geminiReady = Boolean(cfg.geminiApiKey);
  const publishedCount = items.filter((i) => i.status === "PUBLISHED").length;
  const failedCount = items.filter((i) => isFailureStatus(i.status)).length;
  const activeAccounts = accounts.filter((a) => a.enabled).length;

  const searched = items.filter((i) => matchesQuery(i, query));
  const visibleItems = sortItems(
    searched.filter((i) => matchesFilter(i.status, filterKey)),
    sortKey,
  );

  const chips = FILTERS.map((f) => ({
    ...f,
    count: searched.filter((i) => matchesFilter(i.status, f.key)).length,
  }));

  // ── 관제: 마지막 자동 실행 ──────────────────────────────────
  const tickAgeMs = xLastTickAt ? elapsedMs(xLastTickAt) : null;
  const tickLogLines = xLastTickLog.split("\n").filter(Boolean);
  const tickHasError = tickLogLines.some((l) => /오류|실패|error/i.test(l));
  const tickStale = tickAgeMs !== null && tickAgeMs > STALE_TICK_MS;
  const autoRunProblem = cfg.enabled && (xLastTickAt === null || tickStale || tickHasError);
  const autoRunTitle =
    xLastTickAt === null
      ? "자동 실행 기록이 없습니다"
      : tickStale
        ? `자동 실행이 ${Math.floor((tickAgeMs ?? 0) / 3_600_000)}시간째 멈춰 있습니다`
        : "마지막 자동 실행에 오류가 있습니다";

  return (
    <div>
      <Flash msg={sp.msg} err={sp.err} />

      <PageHeader
        eyebrow="Xconda"
        title="X 수집"
        description="X 게시물 URL → 본문 추출 → Gemini 요약 → Notion → 공지 페이지. 관제 계정은 RSS 브릿지로 자동 수집합니다."
        actions={
          <>
            <LinkButton href="/notices" external>
              공지 페이지
            </LinkButton>
            <form action={runTickAction}>
              <input type="hidden" name="back" value={backTo} />
              <SubmitButton variant="primary" pendingText="실행 중…">
                <IconPlay className="h-3.5 w-3.5" />
                지금 실행
              </SubmitButton>
            </form>
          </>
        }
      />

      {missing.length > 0 && (
        <Callout
          tone="warn"
          title="설정이 아직 완료되지 않았습니다"
          className="mb-6"
          action={
            <LinkButton href="#x-settings" size="sm" variant="secondary">
              설정으로 이동
            </LinkButton>
          }
        >
          배포 환경변수와 아래 <b className="text-amber-100">X 수집 설정</b>을 채우면 바로 동작합니다. 자세한 방법은
          저장소의 <code className="rounded bg-amber-400/15 px-1 font-mono">XCONDA_SETUP.md</code>를 참고하세요.
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {missing.map((m) => (
              <li key={m}>
                <Badge tone="warn" className="font-mono">
                  {m}
                </Badge>
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {/* 자동 실행 중단 경고 — 기록 없음/6시간 이상 미실행/마지막 로그에 오류 */}
      {autoRunProblem && (
        <Callout
          tone="danger"
          title={autoRunTitle}
          className="mb-6"
          action={
            <form action={runTickAction}>
              <input type="hidden" name="back" value={backTo} />
              <SubmitButton size="sm" variant="secondary" pendingText="실행 중…">
                <IconPlay className="h-3.5 w-3.5" />
                지금 실행
              </SubmitButton>
            </form>
          }
        >
          <p>
            {xLastTickAt ? (
              <>
                마지막 실행 <b className="text-rose-100">{formatRelativeKst(xLastTickAt)}</b> (
                {formatKst(xLastTickAt)}) · 서버 내장 스케줄러가 꺼져 있거나 서버리스라면{" "}
                <code className="rounded bg-rose-400/15 px-1 font-mono">GET /api/cron</code>을 외부 크론으로
                1분마다 호출해야 합니다.
              </>
            ) : (
              <>
                아직 한 번도 실행되지 않았습니다. 파이프라인이 꺼져 있으면 X 수집 설정에서 켜고,{" "}
                <code className="rounded bg-rose-400/15 px-1 font-mono">GET /api/cron</code> 호출 또는 서버 내장
                스케줄러가 동작 중인지 확인하세요.
              </>
            )}
          </p>
          {tickLogLines.length > 0 && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-rose-950/40 px-2.5 py-2 font-mono text-[11px] leading-5 text-rose-100/90">
              {tickLogLines.join("\n")}
            </pre>
          )}
        </Callout>
      )}

      {!cfg.enabled && (
        <Callout
          tone="info"
          title="X 수집이 일시 중단되었습니다"
          className="mb-6"
          action={
            <LinkButton href="#x-settings" size="sm" variant="secondary">
              켜러 가기
            </LinkButton>
          }
        >
          메일 발송 서비스에 집중하는 동안 자동 수집(cron)을 멈춰 두었습니다. 다시 수집하려면 아래 X 수집 설정의{" "}
          <b className="text-sky-100">파이프라인 사용</b>을 켜세요. 수동 URL 수집은 지금도 동작합니다.
        </Callout>
      )}

      {/* 상태 카드 */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Notion"
          icon={<IconDatabase className="h-3.5 w-3.5" />}
          tone={notionReady ? (dbInfo?.missing.length ? "warn" : "ok") : notionError ? "danger" : "off"}
          value={notionReady ? "연결됨" : notionError ? "오류" : "미설정"}
          hint={
            notionReady
              ? dbInfo?.title || "데이터베이스"
              : notionError
                ? notionError
                : "X 수집 설정에서 DB ID를 입력하세요"
          }
          footer={
            dbInfo && dbInfo.missing.length > 0 ? (
              <div>
                <p className="text-xs leading-5 text-amber-300">누락 속성 {dbInfo.missing.length}개</p>
                <p className="mt-0.5 font-mono text-[11px] leading-4 text-faint">{dbInfo.missing.join(", ")}</p>
                <form action={addMissingPropertiesAction} className="mt-2">
                  <input type="hidden" name="back" value={backTo} />
                  <SubmitButton size="sm" variant="secondary" className="w-full" pendingText="추가 중…">
                    <IconDatabase className="h-3.5 w-3.5" />
                    누락 속성 추가
                  </SubmitButton>
                </form>
              </div>
            ) : dbInfo ? (
              <p className="text-xs leading-5 text-emerald-300">속성 이상 없음</p>
            ) : notionError ? (
              <p className="text-xs leading-5 text-muted">DB 공유·ID를 확인하세요</p>
            ) : undefined
          }
        />
        <StatCard
          label="Gemini"
          icon={<IconSparkles className="h-3.5 w-3.5" />}
          tone={geminiReady ? "ok" : "off"}
          value={geminiReady ? "설정됨" : "미설정"}
          hint={geminiReady ? cfg.geminiModel : "GEMINI_API_KEY 환경변수가 필요합니다"}
        />
        <StatCard
          label="파이프라인"
          icon={<IconClock className="h-3.5 w-3.5" />}
          tone={!cfg.enabled ? "off" : autoRunProblem ? "danger" : "ok"}
          value={cfg.enabled ? "켜짐" : "꺼짐"}
          hint={`${cfg.autoPublish ? "자동 게시" : "수동 게시"} · 게시 시 메일 ${cfg.emailOnPublish ? "발송" : "미발송"}`}
          footer={
            <p className="text-xs leading-5 text-muted">
              마지막 실행:{" "}
              <b className={autoRunProblem ? "text-rose-300" : "text-ink-2"}>
                {xLastTickAt ? formatRelativeKst(xLastTickAt) : "기록 없음"}
              </b>
            </p>
          }
        />
        <StatCard
          label="관제 계정"
          icon={<IconUsers className="h-3.5 w-3.5" />}
          tone={activeAccounts > 0 ? "info" : "off"}
          value={`${activeAccounts}개 감시 중`}
          hint={`게시 완료 ${publishedCount}건${failedCount > 0 ? ` · 실패 ${failedCount}건` : ""} (조회 ${items.length}건 기준)`}
        />
        <StatCard
          label="이미지 보관"
          icon={<IconImage className="h-3.5 w-3.5" />}
          tone={imageStorageStatus === "ready" ? "ok" : imageStorageStatus === "incomplete" ? "warn" : "off"}
          value={
            imageStorageStatus === "ready" ? "설정됨" : imageStorageStatus === "incomplete" ? "설정 확인" : "원본 URL 사용"
          }
          hint={
            imageStorageStatus === "ready"
              ? `Supabase Storage · ${getImageStorageBucketName()}`
              : imageStorageStatus === "incomplete"
                ? "SUPABASE_URL + SERVICE_ROLE_KEY를 확인하세요"
                : "환경변수를 설정하면 이미지 만료를 줄일 수 있습니다"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* URL 수집 */}
          <Panel
            title="URL 수집"
            icon={<IconLink className="h-4 w-4 text-emerald-300" />}
            description="X 게시물 URL을 붙여넣으면 즉시 추출 → Gemini 요약까지 진행합니다."
          >
            <form action={ingestAction} className="space-y-4">
              <input type="hidden" name="back" value={backTo} />
              <div>
                <label className={labelClass} htmlFor="ingest-url">
                  게시물 URL <span className="text-rose-300">*</span>
                </label>
                <input
                  id="ingest-url"
                  name="url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass}
                  placeholder="https://x.com/username/status/1234567890"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="ingest-author">
                  작성자 <span className="font-normal text-faint">(선택)</span>
                </label>
                <input
                  id="ingest-author"
                  name="author"
                  autoComplete="off"
                  className={inputClass}
                  placeholder="@username"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="ingest-text">
                  본문 직접 붙여넣기 <span className="font-normal text-faint">(선택)</span>
                </label>
                <textarea
                  id="ingest-text"
                  name="text"
                  className={`${textareaClass} h-24`}
                  placeholder="게시물 본문을 붙여넣으면 그대로 요약합니다"
                />
                <p className={hintClass}>
                  비공개·삭제된 게시물처럼 추출이 실패할 때 사용하세요. 원문이 있으면 요약 품질이 훨씬 좋아집니다.
                </p>
              </div>
              <div className="flex justify-end">
                <SubmitButton pendingText="수집 · 요약 중…">
                  <IconSparkles className="h-4 w-4" />
                  수집 + AI 요약
                </SubmitButton>
              </div>
            </form>
          </Panel>

          {/* 수집 항목 */}
          <Panel
            title={`수집 항목 (조회 ${items.length}건)`}
            icon={<IconInbox className="h-4 w-4 text-emerald-300" />}
            description="Notion DB가 콘텐츠 Inbox이자 상태 저장소입니다. 검색·정렬·필터는 모두 서버에서 처리되어 URL로 공유할 수 있습니다."
            bodyClassName=""
          >
            <div className="space-y-3 border-b border-line/70 px-5 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SearchForm
                  action="/"
                  defaultValue={query}
                  placeholder="제목·요약·작성자·카테고리·태그 검색"
                  hidden={{
                    status: filterKey === "all" ? undefined : filterKey,
                    sort: sortKey === "new" ? undefined : sortKey,
                    limit: limit > PAGE_SIZE ? String(limit) : undefined,
                  }}
                  className="sm:max-w-md"
                />
                <FilterChips
                  ariaLabel="정렬 방식"
                  items={SORTS.map((s) => ({
                    href: hrefWith({ sort: s.key === "new" ? undefined : s.key }),
                    label: s.label,
                    active: s.key === sortKey,
                  }))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <FilterChips
                  ariaLabel="수집 항목 상태 필터"
                  items={chips.map((f) => ({
                    href: hrefWith({ status: f.key === "all" ? undefined : f.key }),
                    label: f.label,
                    count: f.count,
                    active: f.key === filterKey,
                  }))}
                />
                <p className="text-[11px] leading-4 text-faint">
                  {query ? `검색어 “${query}” 기준 · ` : ""}Notion에서 최근 {items.length}건까지 조회했습니다
                  {itemHasMore ? "" : " (마지막 페이지)"}
                </p>
              </div>
            </div>

            {notionError ? (
              <div className="p-5">
                <Callout tone="danger" title="Notion 조회 실패">
                  {notionError}
                </Callout>
              </div>
            ) : !notionReady ? (
              <div className="p-5">
                <EmptyState
                  icon={<IconDatabase className="h-5 w-5" />}
                  title="Notion 설정을 완료하면 수집 항목이 표시됩니다"
                  description="NOTION_TOKEN 환경변수와 Notion DB ID를 설정하세요. DB가 없다면 아래 X 수집 설정에서 자동으로 만들 수 있습니다."
                  action={<LinkButton href="#x-settings">X 수집 설정으로 이동</LinkButton>}
                />
              </div>
            ) : items.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<IconInbox className="h-5 w-5" />}
                  title="아직 수집된 항목이 없습니다"
                  description="위의 URL 수집에 X 게시물 링크를 붙여넣거나, 관제 계정을 등록해 자동 수집을 시작하세요."
                />
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<IconInbox className="h-5 w-5" />}
                  title={query ? `“${query}”에 해당하는 항목이 없습니다` : "조건에 맞는 항목이 없습니다"}
                  description={`조회한 ${items.length}건 중에서 찾지 못했습니다. 검색어를 바꾸거나 아래에서 더 불러오세요.`}
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <LinkButton href={hrefWith({ q: undefined, status: undefined })}>검색·필터 초기화</LinkButton>
                      {itemHasMore && (
                        <LinkButton href={hrefWith({ limit: String(Math.min(limit + PAGE_SIZE, MAX_ITEMS)) })}>
                          다음 {PAGE_SIZE}건 더 보기
                        </LinkButton>
                      )}
                    </div>
                  }
                />
              </div>
            ) : (
              <>
                <ul className="divide-y divide-line/70">
                  {visibleItems.map((it) => (
                    <li key={it.pageId} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={it.status} />
                            {it.category && <Badge tone="muted">{it.category}</Badge>}
                            {it.sourceDate && (
                              <span className="text-xs text-faint">
                                발행 {formatKst(it.sourceDate).slice(0, 10)}
                              </span>
                            )}
                            {it.author && <span className="text-xs text-faint">· {it.author}</span>}
                            <span className="text-xs text-faint" title={formatKst(it.createdAt)}>
                              · 수집 {formatRelativeKst(it.createdAt)}
                            </span>
                          </div>
                          <h3 className="mt-2 text-sm font-semibold leading-6 text-ink">{it.title || "(제목 없음)"}</h3>
                          <p className="mt-1 text-xs leading-5 text-muted">{STATUS_NEXT[it.status]}</p>
                          {it.summary && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-ink-2">{it.summary}</p>}
                          {it.note && (
                            <p
                              className={`mt-1.5 flex items-start gap-1.5 text-xs leading-5 ${
                                isFailureStatus(it.status) ? "text-rose-300" : "text-muted"
                              }`}
                            >
                              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              {it.note}
                            </p>
                          )}

                          {(it.summary || it.announcement || it.originalText) && (
                            <div className="mt-1">
                              {it.summary && (
                                <DetailBlock label="요약 전문" meta={`${it.summary.length}자`}>
                                  {it.summary}
                                </DetailBlock>
                              )}
                              {it.announcement && (
                                <DetailBlock label="공지문 (뉴스레터 도입부)" meta={`${it.announcement.length}자`}>
                                  {it.announcement}
                                </DetailBlock>
                              )}
                              {it.originalText && (
                                <DetailBlock
                                  label="원문"
                                  meta={
                                    it.originalText.length > ORIGINAL_PREVIEW
                                      ? `${ORIGINAL_PREVIEW}자 / 전체 ${it.originalText.length.toLocaleString()}자`
                                      : `${it.originalText.length}자`
                                  }
                                >
                                  {it.originalText.length > ORIGINAL_PREVIEW
                                    ? `${it.originalText.slice(0, ORIGINAL_PREVIEW)}\n\n… (전체 ${it.originalText.length.toLocaleString()}자 중 ${ORIGINAL_PREVIEW}자 표시)`
                                    : it.originalText}
                                </DetailBlock>
                              )}
                            </div>
                          )}

                          {isFailureStatus(it.status) && <RecoveryForm pageId={it.pageId} back={backTo} />}

                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {it.tags.map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted"
                              >
                                #{t}
                              </span>
                            ))}
                            {it.sourceUrl && (
                              <a
                                href={it.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:underline"
                              >
                                원문
                                <IconExternal className="h-3 w-3" />
                              </a>
                            )}
                            {it.landingUrl && (
                              <a
                                href={it.landingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:underline"
                              >
                                <IconMegaphone className="h-3 w-3" />
                                공지
                              </a>
                            )}
                            {it.notionUrl && (
                              <a
                                href={it.notionUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
                              >
                                Notion
                                <IconExternal className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
                          {it.status !== "PUBLISHED" && (
                            <>
                              {(it.status === "SUMMARIZED" || it.status === "READY") && (
                                <form action={publishAction}>
                                  <input type="hidden" name="pageId" value={it.pageId} />
                                  <input type="hidden" name="back" value={backTo} />
                                  <SubmitButton size="sm" pendingText="게시 중…">
                                    <IconSend className="h-3.5 w-3.5" />
                                    게시
                                  </SubmitButton>
                                </form>
                              )}
                              <form action={retryAction}>
                                <input type="hidden" name="pageId" value={it.pageId} />
                                <input type="hidden" name="back" value={backTo} />
                                <SubmitButton size="sm" variant="secondary" pendingText="처리 중…">
                                  <IconRefresh className="h-3.5 w-3.5" />
                                  다시 처리
                                </SubmitButton>
                              </form>
                              <form action={ignoreAction}>
                                <input type="hidden" name="pageId" value={it.pageId} />
                                <input type="hidden" name="back" value={backTo} />
                                <SubmitButton size="sm" variant="ghost">
                                  <IconTrash className="h-3.5 w-3.5" />
                                  제외
                                </SubmitButton>
                              </form>
                            </>
                          )}
                          {it.status === "PUBLISHED" && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                              <IconCheckCircle className="h-3.5 w-3.5" />
                              게시 완료
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* 더 보기 — 커서를 따라 조회 범위를 100건씩 늘린다 */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-5 py-3">
                  <p className="text-[11px] leading-4 text-faint">
                    {itemHasMore
                      ? `현재 ${items.length}건까지 불러왔습니다 · ${PAGE_SIZE}건씩 최대 ${MAX_ITEMS}건`
                      : `더 불러올 항목이 없습니다 · 조회한 ${items.length}건이 전부입니다`}
                  </p>
                  {itemHasMore && limit < MAX_ITEMS && (
                    <LinkButton size="sm" href={hrefWith({ limit: String(Math.min(limit + PAGE_SIZE, MAX_ITEMS)) })}>
                      다음 {PAGE_SIZE}건 더 보기
                    </LinkButton>
                  )}
                  {limit >= MAX_ITEMS && itemHasMore && (
                    <span className="text-[11px] leading-4 text-amber-300">
                      최대 {MAX_ITEMS}건까지 표시합니다 — 검색으로 좁혀보세요
                    </span>
                  )}
                </div>
              </>
            )}
          </Panel>
        </div>

        {/* 사이드: 설정 + 계정 + 운영 정보 */}
        <div className="space-y-6">
          <Panel
            id="x-settings"
            title="X 수집 설정"
            icon={<IconSettings className="h-4 w-4 text-emerald-300" />}
            className="scroll-mt-24"
          >
            <form action={saveXSettingsAction} className="space-y-4">
              <input type="hidden" name="back" value={backTo} />
              <div>
                <label className={labelClass} htmlFor="x-notion-db">
                  Notion DB ID
                </label>
                <input
                  id="x-notion-db"
                  name="notionDatabaseId"
                  defaultValue={cfg.notionDatabaseId}
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputClass} font-mono`}
                  placeholder="32자리 (Notion DB URL 끝부분)"
                />
                <p className={hintClass}>Notion DB 링크 끝 32자리 문자열입니다.</p>
                {cfg.notionDatabaseId && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <CopyButton value={cfg.notionDatabaseId} label="DB ID 복사" />
                    {dbInfo?.url && (
                      <a
                        href={dbInfo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
                      >
                        Notion에서 열기
                        <IconExternal className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass} htmlFor="x-rsshub">
                  RSSHub 주소 <span className="font-normal text-faint">(선택)</span>
                </label>
                <input
                  id="x-rsshub"
                  name="rsshubBase"
                  defaultValue={cfg.rsshubBase}
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass}
                  placeholder="https://rsshub.example.com"
                />
                <p className={hintClass}>
                  설정하면 관제 계정 피드를 <code className="font-mono">/twitter/user/핸들</code> 경로로 자동 생성합니다.
                  개별 피드 URL은 계정마다 따로 지정할 수도 있습니다.
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="x-max-age">
                  최대 게시물 나이 (일)
                </label>
                <input
                  id="x-max-age"
                  type="number"
                  name="maxAgeDays"
                  min={1}
                  max={365}
                  defaultValue={cfg.maxAgeDays}
                  className={inputClass}
                />
                <p className={hintClass}>이보다 오래된 게시물은 자동으로 제외됩니다.</p>
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium text-ink-2">동작</legend>
                <CheckRow
                  name="enabled"
                  defaultChecked={cfg.enabled}
                  title="파이프라인 사용"
                  description="cron이 15분마다 새 게시물을 자동 처리합니다."
                />
                <CheckRow
                  name="autoPublish"
                  defaultChecked={cfg.autoPublish}
                  title="요약 후 자동 게시"
                  description="요약이 끝나면 바로 Notion 상태를 게시로 바꿉니다."
                />
                <CheckRow
                  name="emailOnPublish"
                  defaultChecked={cfg.emailOnPublish}
                  title="게시 시 뉴스레터 대기열에 추가"
                  description="공지와 함께 구독자 메일 발송 대기열에 넣습니다."
                />
              </fieldset>
              <div className="flex justify-end">
                <SubmitButton pendingText="저장 중…">설정 저장</SubmitButton>
              </div>
            </form>

            {!cfg.notionDatabaseId && (
              <div className="mt-5 rounded-xl border border-dashed border-line-strong/60 bg-canvas/40 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink-2">
                  <IconDatabase className="h-4 w-4 text-emerald-300" />
                  Notion DB가 아직 없나요?
                </p>
                <p className="mt-1.5 text-xs leading-5 text-muted">
                  부모 페이지 링크를 넣고 버튼을 누르면 필요한 속성까지 한 번에 만들어 줍니다. 부모 페이지를 인테그레이션에
                  공유(••• → Connections)해야 합니다.
                </p>
                <form action={createNotionDbAction} className="mt-3 space-y-2">
                  <input type="hidden" name="back" value={backTo} />
                  <label className="sr-only" htmlFor="parent-page">
                    Notion 부모 페이지 링크 또는 ID
                  </label>
                  <input
                    id="parent-page"
                    name="parentPageId"
                    className={inputClass}
                    placeholder="Notion 부모 페이지 링크 또는 ID"
                    autoComplete="off"
                  />
                  <SubmitButton variant="secondary" pendingText="생성 중…" className="w-full">
                    DB 자동 생성
                  </SubmitButton>
                </form>
              </div>
            )}
          </Panel>

          <Panel
            title="관제 계정"
            icon={<IconUsers className="h-4 w-4 text-emerald-300" />}
            description="X 계정을 RSS 피드로 감시합니다. 무료 브릿지는 불안정할 수 있어 실패해도 수동 URL 수집은 그대로 동작합니다."
          >
            <form action={addAccountAction} className="space-y-3">
              <input type="hidden" name="back" value={backTo} />
              <div>
                <label className={labelClass} htmlFor="account-handle">
                  핸들
                </label>
                <input
                  id="account-handle"
                  name="handle"
                  className={inputClass}
                  placeholder="elonmusk"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="account-feed">
                  개별 피드 URL <span className="font-normal text-faint">(선택)</span>
                </label>
                <input
                  id="account-feed"
                  name="feedUrl"
                  className={inputClass}
                  placeholder="RSSHub 미사용 시에만 입력"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="flex justify-end">
                <SubmitButton variant="secondary" pendingText="추가 중…">
                  계정 추가
                </SubmitButton>
              </div>
            </form>

            {accounts.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  icon={<IconUsers className="h-5 w-5" />}
                  title="등록된 계정이 없습니다"
                  description="핸들을 추가하면 15분마다 새 게시물을 확인합니다."
                />
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-line/70">
                {accounts.map((a) => {
                  const feedUrl = a.feedUrl || (cfg.rsshubBase ? `${cfg.rsshubBase}/twitter/user/${a.handle}` : "");
                  return (
                    <li key={a.id} className="py-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-ink">@{a.handle}</span>
                            <Badge tone={a.enabled ? "ok" : "muted"}>{a.enabled ? "감시 중" : "중지됨"}</Badge>
                          </div>
                          <p className="mt-1 truncate font-mono text-[11px] text-faint">
                            {feedUrl || "(RSSHub 미설정 — 개별 피드 URL을 입력하세요)"}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            확인: {formatKst(a.lastCheckedAt)}
                            {a.lastCheckedAt && (
                              <span className="text-faint"> ({formatRelativeKst(a.lastCheckedAt)})</span>
                            )}
                            {a.lastError && <span className="ml-1.5 text-rose-300">· {a.lastError}</span>}
                          </p>
                          {feedUrl && (
                            <div className="mt-1.5">
                              <CopyButton value={feedUrl} label="피드 URL 복사" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <form action={checkAccountAction}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="back" value={backTo} />
                            <SubmitButton size="sm" variant="secondary" pendingText="확인 중…">
                              <IconRefresh className="h-3.5 w-3.5" />
                              확인
                            </SubmitButton>
                          </form>
                          <form action={toggleAccountAction}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="back" value={backTo} />
                            <SubmitButton size="sm" variant="ghost">
                              {a.enabled ? "중지" : "시작"}
                            </SubmitButton>
                          </form>
                          <form action={deleteAccountAction}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="back" value={backTo} />
                            <SubmitButton
                              size="sm"
                              variant="danger"
                              confirm={`@${a.handle} 계정을 삭제할까요?`}
                              pendingText="삭제 중…"
                            >
                              <IconTrash className="h-3.5 w-3.5" />
                              삭제
                            </SubmitButton>
                          </form>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* 운영 정보 — 마지막 실행과 로그를 항상 같은 자리에서 확인 */}
          <Panel
            title="운영 정보"
            icon={<IconHistory className="h-4 w-4 text-emerald-300" />}
            description="내장 스케줄러는 서버가 켜져 있는 동안 60초마다, cron은 호출될 때마다 실행됩니다."
          >
            <KeyValue
              items={[
                {
                  label: "마지막 자동 실행",
                  value: xLastTickAt ? (
                    <>
                      {formatRelativeKst(xLastTickAt)}
                      <span className="block text-faint">{formatKst(xLastTickAt)}</span>
                    </>
                  ) : (
                    "기록 없음"
                  ),
                },
                {
                  label: "마지막 실행 로그",
                  value:
                    tickLogLines.length > 0 ? (
                      <span
                        className={`font-mono text-[11px] leading-5 ${tickHasError ? "text-rose-300" : "text-ink-2"}`}
                      >
                        {tickLogLines.join(" / ")}
                      </span>
                    ) : (
                      "기록 없음"
                    ),
                },
                { label: "자동 게시", value: cfg.autoPublish ? "켜짐" : "꺼짐" },
                { label: "조회 범위", value: `최근 ${items.length}건 (최대 ${MAX_ITEMS}건)` },
              ]}
            />
            <p className="mt-3 text-xs leading-5 text-muted">
              서버리스 환경에서는{" "}
              <code className="rounded bg-surface-2 px-1 font-mono">GET /api/cron</code>을 외부 크론으로 1분마다
              호출하세요. 호출이 멈추면 위 <b className="text-ink-2">자동 실행 중단 경고</b>가 뜹니다.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
