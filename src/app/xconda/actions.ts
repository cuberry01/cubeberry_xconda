"use server";

import { db } from "@/db";
import { xAccounts } from "@/db/schema";
import { updateSettings } from "@/lib/settings";
import { getXcondaConfig } from "@/lib/xconda/config";
import { checkAccount } from "@/lib/xconda/feeds";
import {
  createXcondaDatabase,
  ensureDatabaseProperties,
  getDatabaseInfo,
  updateItem,
} from "@/lib/xconda/notion";
import { ingestUrl, processItem, publishItem, runXcondaTick, setItemStatus, type IngestResult } from "@/lib/xconda/pipeline";
import { STATUS_LABELS, type XStatus } from "@/lib/xconda/types";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * 폼이 hidden `back` 필드로 보낸 현재 화면 경로.
 * 검색·필터가 걸린 URL을 그대로 돌려주기 위한 것이므로 외부 URL은 허용하지 않는다.
 */
function returnTo(formData: FormData): string {
  const raw = String(formData.get("back") || "").trim().replace(/[\r\n]/g, "");
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function back(msg: string, isError = false, to = "/"): never {
  revalidatePath("/", "layout");
  const sep = to.includes("?") ? "&" : "?";
  redirect(`${to}${sep}${isError ? "err" : "msg"}=${encodeURIComponent(msg)}`);
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** 수동 URL 수집 — ingest(url)의 진입점. 원문 직접 붙여넣기(폴백)도 여기로. */
export async function ingestAction(formData: FormData) {
  const to = returnTo(formData);
  const url = String(formData.get("url") || "").trim();
  const manualText = String(formData.get("text") || "").trim();
  const author = String(formData.get("author") || "").trim();
  if (!url) back("URL을 입력하세요.", true, to);

  let r: IngestResult;
  try {
    r = await ingestUrl({
      url,
      manualText: manualText || undefined,
      authorHint: author || undefined,
      processNow: true,
    });
  } catch (e) {
    back(errMsg(e), true, to);
  }

  const failed: (XStatus | "DUPLICATE")[] = ["DUPLICATE", "EXTRACT_FAILED", "AI_FAILED", "PUBLISH_FAILED"];
  const label = r.status === "DUPLICATE" ? "중복" : STATUS_LABELS[r.status] ?? r.status;
  const prefix = r.title ? `"${r.title}" — ` : "";
  back(`${prefix}${label}: ${r.message}`, failed.includes(r.status), to);
}

/** 재시도 — NEW로 되돌린 뒤 즉시 다시 처리 */
export async function retryAction(formData: FormData) {
  const to = returnTo(formData);
  const pageId = String(formData.get("pageId") || "");
  let status: XStatus;
  let message: string;
  try {
    await setItemStatus(pageId, "NEW", "");
    const r = await processItem(pageId);
    status = r.status;
    message = r.message;
  } catch (e) {
    back(errMsg(e), true, to);
  }
  back(`${STATUS_LABELS[status] ?? status}: ${message}`, status.endsWith("_FAILED"), to);
}

/**
 * 실패 항목 복구 — 본문을 직접 붙여넣고 추출 단계를 건너뛴 뒤 요약부터 다시 진행한다.
 * (X 게시물이 비공개/삭제되어 EXTRACT_FAILED가 된 경우의 주 동선)
 */
export async function resummarizeAction(formData: FormData) {
  const to = returnTo(formData);
  const pageId = String(formData.get("pageId") || "");
  const text = String(formData.get("text") || "").trim();
  if (!pageId) back("항목을 찾을 수 없습니다.", true, to);
  if (text.length < 20) back("본문을 20자 이상 붙여넣어 주세요.", true, to);
  if (text.length > 20_000) back("본문이 너무 깁니다. 20,000자 이하로 붙여넣어 주세요.", true, to);

  let status: XStatus;
  let message: string;
  try {
    const cfg = await getXcondaConfig();
    if (!cfg.notionToken || !cfg.notionDatabaseId) back("Notion 설정을 먼저 완료하세요.", true, to);
    await updateItem(cfg, pageId, {
      originalText: text,
      status: "NEW",
      note: "본문 직접 입력 — 추출 건너뛰고 재요약",
    });
    const r = await processItem(pageId);
    status = r.status;
    message = r.message;
  } catch (e) {
    back(errMsg(e), true, to);
  }
  back(`${STATUS_LABELS[status] ?? status}: ${message}`, status.endsWith("_FAILED"), to);
}

export async function publishAction(formData: FormData) {
  const to = returnTo(formData);
  const pageId = String(formData.get("pageId") || "");
  let message: string;
  let ok: boolean;
  try {
    const r = await publishItem(pageId);
    message = r.message;
    ok = r.ok;
  } catch (e) {
    back(errMsg(e), true, to);
  }
  back(message, !ok, to);
}

export async function ignoreAction(formData: FormData) {
  const to = returnTo(formData);
  const pageId = String(formData.get("pageId") || "");
  try {
    await setItemStatus(pageId, "IGNORED", "수동 제외");
  } catch (e) {
    back(errMsg(e), true, to);
  }
  back("항목을 제외했습니다.", false, to);
}

export async function runTickAction(formData: FormData) {
  const to = returnTo(formData);
  let log: string[];
  try {
    log = await runXcondaTick();
  } catch (e) {
    back(errMsg(e), true, to);
  }
  back(log.length ? log.join(" | ") : "처리할 항목이 없습니다.", false, to);
}

// ─── 설정 ────────────────────────────────────────────────────

export async function saveXSettingsAction(formData: FormData) {
  const to = returnTo(formData);
  const notionDatabaseId = String(formData.get("notionDatabaseId") || "").trim();
  const rsshubBase = String(formData.get("rsshubBase") || "").trim().replace(/\/+$/, "");
  const maxAgeDays = Number(formData.get("maxAgeDays") || 14);

  if (notionDatabaseId && !/^[0-9a-f]{32}$/i.test(notionDatabaseId)) {
    back("Notion DB ID는 32자리입니다. DB URL 끝의 32자리 문자열을 확인하세요.", true, to);
  }
  if (rsshubBase && !/^https?:\/\//.test(rsshubBase)) back("RSSHub 주소는 http(s)로 시작해야 합니다.", true, to);
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 365) {
    back("최대 게시물 나이는 1~365일 사이로 입력하세요.", true, to);
  }

  await updateSettings({
    xNotionDatabaseId: notionDatabaseId,
    xRsshubBase: rsshubBase,
    xMaxAgeDays: Math.round(maxAgeDays),
    xAutoPublish: formData.get("autoPublish") === "on",
    xEmailOnPublish: formData.get("emailOnPublish") === "on",
    xEnabled: formData.get("enabled") === "on",
  });
  back("X 수집 설정을 저장했습니다.", false, to);
}

/** 부모 페이지 링크/ID 아래에 Xconda DB를 자동 생성 */
export async function createNotionDbAction(formData: FormData) {
  const to = returnTo(formData);
  const parent = String(formData.get("parentPageId") || "").trim();
  if (!parent) back("Notion 부모 페이지의 링크나 ID를 입력하세요.", true, to);
  const m = parent.match(/([0-9a-f]{32})/i);
  if (!m) back("부모 페이지 ID를 찾지 못했습니다. 노션 페이지 링크 전체를 붙여넣어 보세요.", true, to);

  const cfg = await getXcondaConfig();
  if (!cfg.notionToken) back("먼저 환경변수 NOTION_TOKEN을 설정하세요.", true, to);

  let url: string;
  try {
    const dbInfo = await createXcondaDatabase(cfg, m[1]);
    await updateSettings({ xNotionDatabaseId: dbInfo.id });
    url = dbInfo.url;
  } catch (e) {
    back(
      `Notion DB 생성 실패: ${errMsg(e)} — 부모 페이지를 인테그레이션에 공유(••• 메뉴 → Connections)했는지 확인하세요.`,
      true,
      to,
    );
  }
  back(`Notion DB를 만들었습니다. 노션에서 열어 컬럼을 확인하세요: ${url}`, false, to);
}

/** 기존 DB에 누락 속성만 추가 (Notion에서 직접 만들다 빠뜨린 경우 복구) */
export async function addMissingPropertiesAction(formData: FormData) {
  const to = returnTo(formData);
  const cfg = await getXcondaConfig();
  if (!cfg.notionToken || !cfg.notionDatabaseId) back("Notion 설정을 먼저 완료하세요.", true, to);

  let added: string[] = [];
  try {
    const info = await getDatabaseInfo(cfg);
    if (!info.missing.length) back("누락된 속성이 없습니다.", false, to);
    added = await ensureDatabaseProperties(cfg, info.missing);
  } catch (e) {
    back(`속성 추가 실패: ${errMsg(e)}`, true, to);
  }
  back(
    added.length
      ? `누락 속성 ${added.length}개를 추가했습니다: ${added.join(", ")}`
      : "추가할 수 있는 속성이 없습니다. Notion에서 직접 확인하세요.",
    false,
    to,
  );
}

// ─── 관제 계정 ────────────────────────────────────────────────

export async function addAccountAction(formData: FormData) {
  const to = returnTo(formData);
  const handle = String(formData.get("handle") || "").trim().replace(/^@/, "");
  const feedUrl = String(formData.get("feedUrl") || "").trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) back("X 계정 핸들을 입력하세요 (예: elonmusk).", true, to);
  if (feedUrl && !/^https?:\/\//.test(feedUrl)) back("피드 URL은 http(s)로 시작해야 합니다.", true, to);
  const existing = await db.select().from(xAccounts).where(eq(xAccounts.handle, handle));
  if (existing.length) back(`@${handle} 계정은 이미 등록되어 있습니다.`, true, to);
  await db.insert(xAccounts).values({ handle, feedUrl });
  back(
    `@${handle} 계정을 추가했습니다.${feedUrl ? "" : " RSSHub 주소가 설정되어 있으면 자동으로 피드를 찾습니다."}`,
    false,
    to,
  );
}

export async function toggleAccountAction(formData: FormData) {
  const to = returnTo(formData);
  const id = Number(formData.get("id"));
  const [row] = await db.select().from(xAccounts).where(eq(xAccounts.id, id));
  if (!row) back("계정을 찾을 수 없습니다.", true, to);
  await db.update(xAccounts).set({ enabled: !row.enabled }).where(eq(xAccounts.id, id));
  back(row.enabled ? `@${row.handle} 모니터링을 중지했습니다.` : `@${row.handle} 모니터링을 시작했습니다.`, false, to);
}

export async function deleteAccountAction(formData: FormData) {
  const to = returnTo(formData);
  const id = Number(formData.get("id"));
  await db.delete(xAccounts).where(eq(xAccounts.id, id));
  back("계정을 삭제했습니다.", false, to);
}

export async function checkAccountAction(formData: FormData) {
  const to = returnTo(formData);
  const id = Number(formData.get("id"));
  const [row] = await db.select().from(xAccounts).where(eq(xAccounts.id, id));
  if (!row) back("계정을 찾을 수 없습니다.", true, to);

  const cfg = await getXcondaConfig();
  if (!cfg.notionToken || !cfg.notionDatabaseId) back("Notion 설정을 먼저 완료하세요.", true, to);

  let newItems: number;
  let error: string | undefined;
  try {
    const r = await checkAccount(cfg, row);
    newItems = r.newItems;
    error = r.error;
  } catch (e) {
    back(errMsg(e), true, to);
  }
  back(
    error
      ? `@${row.handle} 확인 실패: ${error}`
      : `@${row.handle} 확인 완료 · 신규 ${newItems}건 · 다음 자동 확인은 15분 이내`,
    Boolean(error),
    to,
  );
}
