import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import {
  IconAlert,
  IconCheckCircle,
  IconClock,
  IconDatabase,
  IconExternal,
  IconImage,
  IconInbox,
  IconLink,
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
  EmptyState,
  LinkButton,
  PageHeader,
  Panel,
  StatCard,
  hintClass,
  inputClass,
  labelClass,
  panelClass,
  textareaClass,
  type BadgeTone,
} from "@/components/ui";
import { db } from "@/db";
import { xAccounts } from "@/db/schema";
import { formatKst } from "@/lib/time";
import { getXcondaConfig, missingConfig } from "@/lib/xconda/config";
import { getImageStorageBucketName, getImageStorageStatus } from "@/lib/xconda/image-storage";
import { getDatabaseInfo, queryItems } from "@/lib/xconda/notion";
import { FAILURE_STATUSES, STATUS_LABELS, type XItem, type XStatus } from "@/lib/xconda/types";
import { asc } from "drizzle-orm";
import Link from "next/link";
import {
  addAccountAction,
  checkAccountAction,
  createNotionDbAction,
  deleteAccountAction,
  ignoreAction,
  ingestAction,
  publishAction,
  retryAction,
  runTickAction,
  saveXSettingsAction,
  toggleAccountAction,
} from "./actions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ msg?: string; err?: string; status?: string }>;

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

export default async function XcondaPage({ searchParams }: { searchParams: PageParams }) {
  const sp = await searchParams;
  const filterKey: FilterKey = (FILTERS.find((f) => f.key === sp.status)?.key ?? "all") as FilterKey;

  // DB 미연결/마이그레이션 전에도 설정 안내가 보이도록 먼저 안전하게 읽는다
  let cfg: Awaited<ReturnType<typeof getXcondaConfig>> | null = null;
  let accounts: (typeof xAccounts.$inferSelect)[] = [];
  let dbError = "";
  try {
    cfg = await getXcondaConfig();
    accounts = await db.select().from(xAccounts).orderBy(asc(xAccounts.id));
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
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
  let dbInfo = null as Awaited<ReturnType<typeof getDatabaseInfo>> | null;
  let notionError = "";
  if (!missing.some((m) => m.includes("Notion")) && cfg.notionToken && cfg.notionDatabaseId) {
    try {
      dbInfo = await getDatabaseInfo(cfg);
      items = await queryItems(cfg, { pageSize: 50 });
    } catch (e) {
      notionError = e instanceof Error ? e.message : String(e);
    }
  }

  const notionReady = Boolean(cfg.notionToken && cfg.notionDatabaseId && !notionError);
  const geminiReady = Boolean(cfg.geminiApiKey);
  const publishedCount = items.filter((i) => i.status === "PUBLISHED").length;
  const failedCount = items.filter((i) => FAILURE_STATUSES.includes(i.status as XStatus)).length;
  const activeAccounts = accounts.filter((a) => a.enabled).length;
  const visibleItems = items.filter((i) => matchesFilter(i.status, filterKey));

  const chips = FILTERS.map((f) => ({
    ...f,
    count: items.filter((i) => matchesFilter(i.status, f.key)).length,
  }));

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
              <SubmitButton variant="primary" pendingText="실행 중…">
                <IconPlay className="h-3.5 w-3.5" />
                지금 실행
              </SubmitButton>
            </form>
          </>
        }
      />

      {missing.length > 0 && (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3.5 text-sm">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-200">설정이 아직 완료되지 않았습니다</p>
            <p className="mt-1 text-xs leading-5 text-amber-100/80">
              배포 환경변수와 아래 <b>X 수집 설정</b>을 채우면 바로 동작합니다. 자세한 방법은 저장소의{" "}
              <code className="rounded bg-amber-400/15 px-1 font-mono">XCONDA_SETUP.md</code>를 참고하세요.
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {missing.map((m) => (
                <li key={m}>
                  <Badge tone="warn" className="font-mono">
                    {m}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 상태 카드 */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Notion"
          icon={<IconDatabase className="h-3.5 w-3.5" />}
          tone={notionReady ? "ok" : notionError ? "danger" : "off"}
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
              <p className="text-xs leading-5 text-amber-300">누락 속성: {dbInfo.missing.join(", ")}</p>
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
          tone={cfg.enabled ? "ok" : "off"}
          value={cfg.enabled ? "켜짐" : "꺼짐"}
          hint={`${cfg.autoPublish ? "자동 게시" : "수동 게시"} · 게시 시 메일 ${cfg.emailOnPublish ? "발송" : "미발송"}`}
        />
        <StatCard
          label="관제 계정"
          icon={<IconUsers className="h-3.5 w-3.5" />}
          tone={activeAccounts > 0 ? "info" : "off"}
          value={`${activeAccounts}개 감시 중`}
          hint={`게시 완료 ${publishedCount}건${failedCount > 0 ? ` · 실패 ${failedCount}건` : ""}`}
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
            title={`수집 항목 (${items.length})`}
            icon={<IconInbox className="h-4 w-4 text-emerald-300" />}
            description="Notion DB가 콘텐츠 Inbox이자 상태 저장소입니다."
            bodyClassName=""
          >
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line/70 px-5 py-3">
              {chips.map((f) => {
                const active = f.key === filterKey;
                return (
                  <Link
                    key={f.key}
                    href={f.key === "all" ? "/" : `/?status=${f.key}`}
                    aria-current={active ? "true" : undefined}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition-colors duration-150 ${
                      active
                        ? "bg-primary/15 text-emerald-300 ring-primary/30"
                        : "bg-surface-2/50 text-muted ring-line/80 hover:text-ink"
                    }`}
                  >
                    {f.label}
                    <span className="font-mono text-[11px] text-faint">{f.count}</span>
                  </Link>
                );
              })}
            </div>

            {notionError ? (
              <div className="p-5">
                <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="leading-6">Notion 조회 실패: {notionError}</span>
                </div>
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
                  title="조건에 맞는 항목이 없습니다"
                  action={<LinkButton href="/">전체 보기</LinkButton>}
                />
              </div>
            ) : (
              <ul className="divide-y divide-line/70">
                {visibleItems.map((it) => (
                  <li key={it.pageId} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={it.status} />
                          {it.category && <Badge tone="muted">{it.category}</Badge>}
                          <span className="text-xs text-faint">
                            {it.sourceDate ? formatKst(it.sourceDate).slice(0, 11) : "날짜 미상"}
                          </span>
                          {it.author && <span className="text-xs text-faint">· {it.author}</span>}
                        </div>
                        <h3 className="mt-2 text-sm font-semibold leading-6 text-ink">{it.title || "(제목 없음)"}</h3>
                        {it.summary && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{it.summary}</p>}
                        {it.note && (
                          <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-rose-300">
                            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {it.note}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
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
                                <SubmitButton size="sm" pendingText="게시 중…">
                                  <IconSend className="h-3.5 w-3.5" />
                                  게시
                                </SubmitButton>
                              </form>
                            )}
                            <form action={retryAction}>
                              <input type="hidden" name="pageId" value={it.pageId} />
                              <SubmitButton size="sm" variant="secondary" pendingText="처리 중…">
                                <IconRefresh className="h-3.5 w-3.5" />
                                다시 처리
                              </SubmitButton>
                            </form>
                            <form action={ignoreAction}>
                              <input type="hidden" name="pageId" value={it.pageId} />
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
            )}
          </Panel>
        </div>

        {/* 사이드: 설정 + 계정 */}
        <div className="space-y-6">
          <Panel
            id="x-settings"
            title="X 수집 설정"
            icon={<IconSettings className="h-4 w-4 text-emerald-300" />}
            className="scroll-mt-24"
          >
            <form action={saveXSettingsAction} className="space-y-4">
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
                {accounts.map((a) => (
                  <li key={a.id} className="py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-ink">@{a.handle}</span>
                          <Badge tone={a.enabled ? "ok" : "muted"}>{a.enabled ? "감시 중" : "중지됨"}</Badge>
                        </div>
                        <p className="mt-1 truncate font-mono text-[11px] text-faint">
                          {a.feedUrl || `${cfg.rsshubBase || "(RSSHub 미설정)"}/twitter/user/${a.handle}`}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          확인: {formatKst(a.lastCheckedAt)}
                          {a.lastError && <span className="ml-1.5 text-rose-300">· {a.lastError}</span>}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <form action={checkAccountAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <SubmitButton size="sm" variant="secondary" pendingText="확인 중…">
                            <IconRefresh className="h-3.5 w-3.5" />
                            확인
                          </SubmitButton>
                        </form>
                        <form action={toggleAccountAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <SubmitButton size="sm" variant="ghost">
                            {a.enabled ? "중지" : "시작"}
                          </SubmitButton>
                        </form>
                        <form action={deleteAccountAction}>
                          <input type="hidden" name="id" value={a.id} />
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
                ))}
              </ul>
            )}
          </Panel>

          <div className={`${panelClass} p-4`}>
            <p className="flex items-center gap-2 text-xs font-semibold text-ink-2">
              <IconClock className="h-3.5 w-3.5 text-emerald-300" />
              자동 수집 주기
            </p>
            <p className="mt-1.5 text-xs leading-5 text-muted">
              서버가 켜져 있는 동안 내장 스케줄러가 주기적으로 피드를 확인합니다. 서버리스 환경에서는{" "}
              <code className="rounded bg-surface-2 px-1 font-mono">GET /api/cron</code>을 외부 크론으로 호출하세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
