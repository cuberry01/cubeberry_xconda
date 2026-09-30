"use server";

import { db } from "@/db";
import { xAccounts } from "@/db/schema";
import { updateSettings } from "@/lib/settings";
import { getXcondaConfig } from "@/lib/xconda/config";
import { checkAccount } from "@/lib/xconda/feeds";
import { createXcondaDatabase, updateItem } from "@/lib/xconda/notion";
import { ingestUrl, processItem, publishItem, runXcondaTick, setItemStatus, type IngestResult } from "@/lib/xconda/pipeline";
import { STATUS_LABELS, type XStatus } from "@/lib/xconda/types";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function back(msg: string, isError = false): never {
  revalidatePath("/xconda", "layout");
  redirect(`/xconda?${isError ? "err" : "msg"}=${encodeURIComponent(msg)}`);
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** 수동 URL 수집 — ingest(url)의 진입점. 원문 직접 붙여넣기(폴백)도 여기로. */
export async function ingestAction(formData: FormData) {
  const url = String(formData.get("url") || "").trim();
  const manualText = String(formData.get("text") || "").trim();
  const author = String(formData.get("author") || "").trim();
  if (!url) back("URL을 입력하세요.", true);

  let r: IngestResult;
  try {
    r = await ingestUrl({
      url,
      manualText: manualText || undefined,
      authorHint: author || undefined,
      processNow: true,
    });
  } catch (e) {
    back(errMsg(e), true);
  }

  const failed: (XStatus | "DUPLICATE")[] = ["DUPLICATE", "EXTRACT_FAILED", "AI_FAILED", "PUBLISH_FAILED"];
  const label = r.status === "DUPLICATE" ? "중복" : STATUS_LABELS[r.status] ?? r.status;
  const prefix = r.title ? `"${r.title}" — ` : "";
  back(`${prefix}${label}: ${r.message}`, failed.includes(r.status));
}

/** 재시도 — NEW로 되돌린 뒤 즉시 다시 처리 */
export async function retryAction(formData: FormData) {
  const pageId = String(formData.get("pageId") || "");
  let status: XStatus;
  let message: string;
  try {
    await setItemStatus(pageId, "NEW", "");
    const r = await processItem(pageId);
    status = r.status;
    message = r.message;
  } catch (e) {
    back(errMsg(e), true);
  }
  back(`${STATUS_LABELS[status] ?? status}: ${message}`, status.endsWith("_FAILED"));
}

export async function publishAction(formData: FormData) {
  const pageId = String(formData.get("pageId") || "");
  let message: string;
  let ok: boolean;
  try {
    const r = await publishItem(pageId);
    message = r.message;
    ok = r.ok;
  } catch (e) {
    back(errMsg(e), true);
  }
  back(message, !ok);
}

export async function ignoreAction(formData: FormData) {
  const pageId = String(formData.get("pageId") || "");
  try {
    await setItemStatus(pageId, "IGNORED", "수동 제외");
  } catch (e) {
    back(errMsg(e), true);
  }
  back("항목을 제외했습니다.");
}

export async function runTickAction() {
  let log: string[];
  try {
    log = await runXcondaTick();
  } catch (e) {
    back(errMsg(e), true);
  }
  back(log.length ? log.join(" | ") : "처리할 항목이 없습니다.");
}

// ─── 설정 ────────────────────────────────────────────────────

export async function saveXSettingsAction(formData: FormData) {
  const notionDatabaseId = String(formData.get("notionDatabaseId") || "").trim();
  const rsshubBase = String(formData.get("rsshubBase") || "").trim().replace(/\/+$/, "");
  const maxAgeDays = Number(formData.get("maxAgeDays") || 14);

  if (notionDatabaseId && !/^[0-9a-f]{32}$/i.test(notionDatabaseId)) {
    back("Notion DB ID는 32자리입니다. DB URL 끝의 32자리 문자열을 확인하세요.", true);
  }
  if (rsshubBase && !/^https?:\/\//.test(rsshubBase)) back("RSSHub 주소는 http(s)로 시작해야 합니다.", true);
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 365) {
    back("최대 게시물 나이는 1~365일 사이로 입력하세요.", true);
  }

  await updateSettings({
    xNotionDatabaseId: notionDatabaseId,
    xRsshubBase: rsshubBase,
    xMaxAgeDays: Math.round(maxAgeDays),
    xAutoPublish: formData.get("autoPublish") === "on",
    xEmailOnPublish: formData.get("emailOnPublish") === "on",
    xEnabled: formData.get("enabled") === "on",
  });
  back("X 수집 설정을 저장했습니다.");
}

/** 부모 페이지 링크/ID 아래에 Xconda DB를 자동 생성 */
export async function createNotionDbAction(formData: FormData) {
  const parent = String(formData.get("parentPageId") || "").trim();
  if (!parent) back("Notion 부모 페이지의 링크나 ID를 입력하세요.", true);
  const m = parent.match(/([0-9a-f]{32})/i);
  if (!m) back("부모 페이지 ID를 찾지 못했습니다. 노션 페이지 링크 전체를 붙여넣어 보세요.", true);

  const cfg = await getXcondaConfig();
  if (!cfg.notionToken) back("먼저 환경변수 NOTION_TOKEN을 설정하세요.", true);

  let url: string;
  try {
    const dbInfo = await createXcondaDatabase(cfg, m[1]);
    await updateSettings({ xNotionDatabaseId: dbInfo.id });
    url = dbInfo.url;
  } catch (e) {
    back(
      `Notion DB 생성 실패: ${errMsg(e)} — 부모 페이지를 인테그레이션에 공유(••• 메뉴 → Connections)했는지 확인하세요.`,
      true,
    );
  }
  back(`Notion DB를 만들었습니다. 노션에서 열어 컬럼을 확인하세요: ${url}`);
}

// ─── 관제 계정 ────────────────────────────────────────────────

export async function addAccountAction(formData: FormData) {
  const handle = String(formData.get("handle") || "").trim().replace(/^@/, "");
  const feedUrl = String(formData.get("feedUrl") || "").trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) back("X 계정 핸들을 입력하세요 (예: elonmusk).", true);
  if (feedUrl && !/^https?:\/\//.test(feedUrl)) back("피드 URL은 http(s)로 시작해야 합니다.", true);
  const existing = await db.select().from(xAccounts).where(eq(xAccounts.handle, handle));
  if (existing.length) back(`@${handle} 계정은 이미 등록되어 있습니다.`, true);
  await db.insert(xAccounts).values({ handle, feedUrl });
  back(
    `@${handle} 계정을 추가했습니다.${feedUrl ? "" : " RSSHub 주소가 설정되어 있으면 자동으로 피드를 찾습니다."}`,
  );
}

export async function toggleAccountAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const [row] = await db.select().from(xAccounts).where(eq(xAccounts.id, id));
  if (!row) back("계정을 찾을 수 없습니다.", true);
  await db.update(xAccounts).set({ enabled: !row.enabled }).where(eq(xAccounts.id, id));
  back(row.enabled ? `@${row.handle} 모니터링을 중지했습니다.` : `@${row.handle} 모니터링을 시작했습니다.`);
}

export async function deleteAccountAction(formData: FormData) {
  const id = Number(formData.get("id"));
  await db.delete(xAccounts).where(eq(xAccounts.id, id));
  back("계정을 삭제했습니다.");
}

export async function checkAccountAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const [row] = await db.select().from(xAccounts).where(eq(xAccounts.id, id));
  if (!row) back("계정을 찾을 수 없습니다.", true);

  const cfg = await getXcondaConfig();
  if (!cfg.notionToken || !cfg.notionDatabaseId) back("Notion 설정을 먼저 완료하세요.", true);

  let newItems: number;
  let error: string | undefined;
  try {
    const r = await checkAccount(cfg, row);
    newItems = r.newItems;
    error = r.error;
  } catch (e) {
    back(errMsg(e), true);
  }
  back(
    error
      ? `@${row.handle} 확인 실패: ${error}`
      : `@${row.handle} 확인 완료 · 신규 ${newItems}건 · 다음 자동 확인은 15분 이내`,
    Boolean(error),
  );
}
