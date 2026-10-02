// Xconda Notion 클라이언트 — Notion DB가 콘텐츠 Inbox + 상태 DB의 원천이다.
// (blog-writer와 달리 로컬 data/ 대신 Notion을 single source of truth로 사용)

import type { XcondaConfig } from "./config";
import { isXStatus, type XItem, type XStatus } from "./types";
import { truncate } from "./util";

export const PROP = {
  title: "Title",
  sourceUrl: "Source URL",
  author: "Source Author",
  originalText: "Original Text",
  summary: "Summary",
  category: "Category",
  announcement: "Announcement",
  tags: "Tags",
  status: "Status",
  published: "Published",
  landingUrl: "Landing URL",
  sourceDate: "Source Date",
  createdAt: "Created At",
  imageUrl: "Image URL",
  note: "Note",
} as const;

export const ALL_PROPS = Object.values(PROP);

export interface ItemPatch {
  title?: string;
  sourceUrl?: string;
  author?: string;
  originalText?: string;
  summary?: string;
  announcement?: string;
  category?: string;
  tags?: string[];
  status?: XStatus;
  published?: boolean;
  landingUrl?: string;
  imageUrl?: string;
  sourceDate?: Date | null;
  createdAt?: Date | null;
  note?: string;
}

interface NotionPage {
  id: string;
  url?: string;
  created_time?: string;
  properties?: Record<string, unknown>;
}

interface NotionBlock {
  id: string;
  type?: string;
  image?: {
    type?: string;
    external?: { url?: string };
    file?: { url?: string };
  };
}

const NOTION_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";

export class NotionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "NotionError";
  }
}

async function notionFetch(cfg: XcondaConfig, path: string, init?: RequestInit, retry429 = true): Promise<unknown> {
  if (!cfg.notionToken) throw new Error("NOTION_TOKEN 환경변수가 설정되지 않았습니다. XCONDA_SETUP.md를 참고하세요.");
  const res = await fetch(`${NOTION_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.notionToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  // Rate limit(3 rps) — 잠시 기다렸다가 1회 재시도
  if (res.status === 429 && retry429) {
    await new Promise((r) => setTimeout(r, 1200));
    return notionFetch(cfg, path, init, false);
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { object?: string; message?: string; code?: string };
      if (body?.object === "error" && body.message) {
        message = `${body.message}${body.code ? ` (${body.code})` : ""}`;
        if (res.status === 401) message += " — NOTION_TOKEN이 잘못되었거나 만료되었습니다.";
        if (res.status === 404) message += " — DB를 인테그레이션에 공유했는지, DB ID가 올바른지 확인하세요.";
      }
    } catch {
      // 응답 본문 파싱 실패 시 statusText 사용
    }
    throw new NotionError(`Notion API ${res.status}: ${message}`, res.status);
  }
  return res.json();
}

/** Notion rich_text 제약(항목당 2000자)에 맞춰 분할. 최대 ~22k자 저장. */
function richTextChunks(text: string, maxChunks = 12): { text: { content: string } }[] {
  const clean = text || "";
  if (!clean) return [];
  const chunks: { text: { content: string } }[] = [];
  for (let i = 0; i < clean.length && chunks.length < maxChunks; i += 1900) {
    chunks.push({ text: { content: clean.slice(i, i + 1900) } });
  }
  return chunks;
}

export function toProperties(patch: ItemPatch): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (patch.title !== undefined) props[PROP.title] = { title: richTextChunks(patch.title, 2) };
  if (patch.sourceUrl !== undefined) props[PROP.sourceUrl] = { url: patch.sourceUrl || null };
  if (patch.author !== undefined) props[PROP.author] = { rich_text: richTextChunks(truncate(patch.author, 200), 1) };
  if (patch.originalText !== undefined) props[PROP.originalText] = { rich_text: richTextChunks(patch.originalText) };
  if (patch.summary !== undefined) props[PROP.summary] = { rich_text: richTextChunks(patch.summary, 3) };
  if (patch.announcement !== undefined) props[PROP.announcement] = { rich_text: richTextChunks(patch.announcement, 2) };
  if (patch.category !== undefined && patch.category) props[PROP.category] = { select: { name: truncate(patch.category, 100) } };
  if (patch.tags !== undefined) props[PROP.tags] = { multi_select: patch.tags.filter(Boolean).map((t) => ({ name: truncate(t, 100) })) };
  if (patch.status !== undefined && patch.status) props[PROP.status] = { select: { name: patch.status } };
  if (patch.published !== undefined) props[PROP.published] = { checkbox: patch.published };
  if (patch.landingUrl !== undefined) props[PROP.landingUrl] = { url: patch.landingUrl || null };
  if (patch.imageUrl !== undefined) props[PROP.imageUrl] = { url: patch.imageUrl || null };
  if (patch.sourceDate !== undefined) props[PROP.sourceDate] = { date: patch.sourceDate ? { start: patch.sourceDate.toISOString() } : null };
  if (patch.createdAt !== undefined) props[PROP.createdAt] = { date: patch.createdAt ? { start: patch.createdAt.toISOString() } : null };
  if (patch.note !== undefined) props[PROP.note] = { rich_text: richTextChunks(truncate(patch.note, 1900), 1) };
  return props;
}

// ─── 속성 읽기 ───────────────────────────────────────────────

function readRichText(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const o = v as { rich_text?: unknown; title?: unknown };
  const arr = (o.rich_text ?? o.title) as { text?: { content?: string } }[] | undefined;
  if (!Array.isArray(arr)) return "";
  return arr.map((t) => t?.text?.content ?? "").join("");
}

function readUrl(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  return String((v as { url?: string | null }).url ?? "");
}

function readSelect(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  return String((v as { select?: { name?: string } }).select?.name ?? "");
}

function readMultiSelect(v: unknown): string[] {
  if (!v || typeof v !== "object") return [];
  const arr = (v as { multi_select?: { name?: string }[] }).multi_select;
  if (!Array.isArray(arr)) return [];
  return arr.map((o) => o?.name ?? "").filter(Boolean);
}

function readDate(v: unknown): Date | null {
  if (!v || typeof v !== "object") return null;
  const start = (v as { date?: { start?: string } | null }).date?.start;
  if (!start) return null;
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapPage(page: NotionPage): XItem {
  const p = page.properties ?? {};
  const status = readSelect(p[PROP.status]);
  return {
    pageId: page.id,
    notionUrl: page.url ?? "",
    title: readRichText(p[PROP.title]),
    sourceUrl: readUrl(p[PROP.sourceUrl]),
    author: readRichText(p[PROP.author]),
    originalText: readRichText(p[PROP.originalText]),
    summary: readRichText(p[PROP.summary]),
    announcement: readRichText(p[PROP.announcement]),
    category: readSelect(p[PROP.category]),
    tags: readMultiSelect(p[PROP.tags]),
    imageUrl: readUrl(p[PROP.imageUrl]),
    status: status && isXStatus(status) ? status : "",
    published: Boolean((p[PROP.published] as { checkbox?: boolean } | undefined)?.checkbox),
    landingUrl: readUrl(p[PROP.landingUrl]),
    sourceDate: readDate(p[PROP.sourceDate]),
    createdAt: readDate(p[PROP.createdAt]) ?? (page.created_time ? new Date(page.created_time) : null),
    note: readRichText(p[PROP.note]),
  };
}

// ─── CRUD ────────────────────────────────────────────────────

export async function createItem(cfg: XcondaConfig, patch: ItemPatch): Promise<XItem> {
  const data = (await notionFetch(cfg, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: cfg.notionDatabaseId },
      properties: toProperties({
        title: patch.title ?? "제목 없음",
        sourceUrl: patch.sourceUrl ?? "",
        status: patch.status ?? "NEW",
        createdAt: patch.createdAt ?? new Date(),
        ...patch,
      }),
    }),
  })) as NotionPage;
  return mapPage(data);
}

export async function updateItem(cfg: XcondaConfig, pageId: string, patch: ItemPatch): Promise<void> {
  const props = toProperties(patch);
  if (!Object.keys(props).length) return;
  await notionFetch(cfg, `/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: props }),
  });
}

export async function getItem(cfg: XcondaConfig, pageId: string): Promise<XItem | null> {
  const data = (await notionFetch(cfg, `/pages/${pageId}`)) as NotionPage;
  return data?.id ? mapPage(data) : null;
}

function isSupportedExternalImage(url: string): boolean {
  try {
    return /\.(bmp|gif|heic|jpe?g|png|svg|tiff?)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function readBlockImageUrl(block: NotionBlock): string {
  if (block.type !== "image" || !block.image) return "";
  return block.image.external?.url ?? block.image.file?.url ?? "";
}

/** Add/replace the Xconda image block in the Notion page body (in addition to Image URL). */
export async function syncImageBlock(
  cfg: XcondaConfig,
  pageId: string,
  imageUrl: string,
  previousImageUrl = "",
): Promise<boolean> {
  const targetUrl = imageUrl.trim();
  if (!targetUrl || !isSupportedExternalImage(targetUrl)) return false;

  const blocks: NotionBlock[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const data = (await notionFetch(cfg, `/blocks/${pageId}/children?${query.toString()}`)) as {
      results?: NotionBlock[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    blocks.push(...(data.results ?? []));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  const existing = blocks.find((block) => readBlockImageUrl(block) === targetUrl);
  if (!existing) {
    await notionFetch(cfg, `/blocks/${pageId}/children`, {
      method: "PATCH",
      body: JSON.stringify({
        children: [
          {
            object: "block",
            type: "image",
            image: { type: "external", external: { url: targetUrl }, caption: [] },
          },
        ],
      }),
    });
  }

  const oldUrl = previousImageUrl.trim();
  if (oldUrl && oldUrl !== targetUrl) {
    for (const block of blocks) {
      if (readBlockImageUrl(block) === oldUrl) {
        await notionFetch(cfg, `/blocks/${block.id}`, { method: "DELETE" });
      }
    }
  }

  return !existing;
}

export interface QueryOptions {
  status?: XStatus;
  pageSize?: number;
  /** 이전 페이지의 next_cursor — "더 보기"에 사용 */
  cursor?: string;
}

export interface QueryPage {
  items: XItem[];
  /** 다음 페이지 커서(없으면 마지막 페이지) */
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Notion DB 쿼리 1페이지 — 커서 기반 페이지네이션.
 * Notion `page_size` 상한은 100이라 그보다 큰 요청은 100으로 낮춥니다.
 */
export async function queryItemsPage(cfg: XcondaConfig, opts: QueryOptions = {}): Promise<QueryPage> {
  const body: Record<string, unknown> = {
    page_size: Math.min(opts.pageSize ?? 20, 100),
    sorts: [{ timestamp: "created_time", direction: "descending" }],
  };
  if (opts.cursor) body.start_cursor = opts.cursor;
  if (opts.status) body.filter = { property: PROP.status, select: { equals: opts.status } };
  const data = (await notionFetch(cfg, `/databases/${cfg.notionDatabaseId}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  })) as { results?: NotionPage[]; has_more?: boolean; next_cursor?: string | null };
  return {
    items: (data.results ?? []).map(mapPage),
    nextCursor: data.next_cursor ?? null,
    hasMore: Boolean(data.has_more && data.next_cursor),
  };
}

/** 커서를 따라가며 최대 maxItems개를 모은다 (화면의 "더 보기" 범위 계산용) */
export async function queryItemsUpTo(
  cfg: XcondaConfig,
  maxItems: number,
  pageSize = 100,
): Promise<{ items: XItem[]; hasMore: boolean }> {
  const items: XItem[] = [];
  let cursor: string | undefined;
  let more = false;
  for (let guard = 0; guard < 50; guard++) {
    const page: QueryPage = await queryItemsPage(cfg, { pageSize, cursor });
    items.push(...page.items);
    more = page.hasMore;
    if (!page.hasMore || items.length >= maxItems) break;
    cursor = page.nextCursor ?? undefined;
  }
  // 마지막 페이지에서 maxItems를 넘겨 받은 경우에도 "더 보기"가 가능해야 한다
  return { items: items.slice(0, maxItems), hasMore: more || items.length > maxItems };
}

/** 단일 페이지 조회 (파이프라인 내부용) */
export async function queryItems(cfg: XcondaConfig, opts: QueryOptions = {}): Promise<XItem[]> {
  const page = await queryItemsPage(cfg, opts);
  return page.items;
}

/** URL 중복 검사 — ingest(url)의 첫 번째 필터 */
export async function findBySourceUrl(cfg: XcondaConfig, url: string): Promise<XItem | null> {
  const data = (await notionFetch(cfg, `/databases/${cfg.notionDatabaseId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 1,
      filter: { property: PROP.sourceUrl, url: { equals: url } },
    }),
  })) as { results?: NotionPage[] };
  const first = (data.results ?? [])[0];
  return first ? mapPage(first) : null;
}

// ─── DB 스키마 확인 / 자동 생성 ────────────────────────────────

export interface NotionDbInfo {
  id: string;
  title: string;
  url: string;
  missing: string[];
}

export async function getDatabaseInfo(cfg: XcondaConfig): Promise<NotionDbInfo> {
  const data = (await notionFetch(cfg, `/databases/${cfg.notionDatabaseId}`)) as {
    id?: string;
    url?: string;
    title?: { plain_text?: string }[];
    properties?: Record<string, unknown>;
  };
  const have = new Set(Object.keys(data.properties ?? {}));
  const missing = ALL_PROPS.filter((p) => !have.has(p));
  return {
    id: data.id ?? cfg.notionDatabaseId,
    title: (data.title ?? []).map((t) => t.plain_text ?? "").join(""),
    url: data.url ?? "",
    missing,
  };
}

const STATUS_OPTIONS: { name: string; color: string }[] = [
  { name: "NEW", color: "gray" },
  { name: "EXTRACTED", color: "blue" },
  { name: "SUMMARIZED", color: "purple" },
  { name: "READY", color: "yellow" },
  { name: "PUBLISHED", color: "green" },
  { name: "EXTRACT_FAILED", color: "red" },
  { name: "AI_FAILED", color: "red" },
  { name: "PUBLISH_FAILED", color: "red" },
  { name: "IGNORED", color: "brown" },
];

const CATEGORY_OPTIONS = ["AI 모델", "AI 영상", "AI 이미지", "AI 도구", "뉴스", "기타"].map((name) => ({ name }));

/** DB 생성/속성 추가에 공통으로 쓰는 속성 정의 (Notion 속성 형식) */
export const DB_PROPERTY_DEFS: Record<string, Record<string, unknown>> = {
  [PROP.title]: { title: {} },
  [PROP.sourceUrl]: { url: {} },
  [PROP.author]: { rich_text: {} },
  [PROP.originalText]: { rich_text: {} },
  [PROP.summary]: { rich_text: {} },
  [PROP.announcement]: { rich_text: {} },
  [PROP.category]: { select: { options: CATEGORY_OPTIONS } },
  [PROP.tags]: { multi_select: {} },
  [PROP.status]: { select: { options: STATUS_OPTIONS } },
  [PROP.published]: { checkbox: {} },
  [PROP.landingUrl]: { url: {} },
  [PROP.sourceDate]: { date: {} },
  [PROP.createdAt]: { date: {} },
  [PROP.imageUrl]: { url: {} },
  [PROP.note]: { rich_text: {} },
};

/**
 * 이미 있는 DB에 누락 속성만 추가한다 (기존 행/데이터는 그대로).
 * getDatabaseInfo()가 돌려주는 missing 목록을 그대로 넘기면 된다.
 */
export async function ensureDatabaseProperties(cfg: XcondaConfig, missing: string[]): Promise<string[]> {
  const properties: Record<string, unknown> = {};
  for (const name of missing) {
    const def = DB_PROPERTY_DEFS[name];
    if (def) properties[name] = def;
  }
  const names = Object.keys(properties);
  if (!names.length) return [];
  await notionFetch(cfg, `/databases/${cfg.notionDatabaseId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
  return names;
}

/** 부모 페이지 아래에 Xconda DB를 필요한 속성까지 포함해 자동 생성 */
export async function createXcondaDatabase(cfg: XcondaConfig, parentPageId: string): Promise<{ id: string; url: string }> {
  const data = (await notionFetch(cfg, "/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: { page_id: parentPageId },
      title: [{ type: "text", text: { content: "Xconda" } }],
      properties: DB_PROPERTY_DEFS,
    }),
  })) as { id: string; url: string };
  return { id: data.id, url: data.url };
}
