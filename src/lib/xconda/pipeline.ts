// Xconda 파이프라인 오케스트레이터.
//
//   ingest(url) → [필터: URL 중복] → Notion NEW
//   processItem → [필터: 신선도] → 추출 → [필터: AI 관련성, 제목 유사도] → Gemini → SUMMARIZED
//   publishItem → Notion PUBLISHED + /notices 공지 + (선택) 메일 대기열
//
// cron(/api/cron)과 관리자 액션이 같은 함수를 공유한다.

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contents } from "@/db/schema";
import { getAIEngine, type SummarizeResult } from "./ai";
import { getXcondaConfig, missingConfig, resolveBaseUrl, type XcondaConfig } from "./config";
import { extractXPost, extractWebPage } from "./extract";
import { checkDueAccounts } from "./feeds";
import { createItem, findBySourceUrl, getItem, queryItems, updateItem } from "./notion";
import { canonicalizeUrl, findSimilarTitle, parseStatusUrl } from "./similarity";
import { FAILURE_STATUSES, itemAnchor, STATUS_LABELS, type XItem, type XStatus } from "./types";
import { truncate } from "./util";

/** 틱당 처리 상한 — Vercel 함수 60s 예산 안에서 돌도록 */
const MAX_PROCESS_PER_TICK = 4;
/** 제목 유사도 비교 대상 (최근 항목) */
const TITLE_COMPARE_LIMIT = 100;

export interface IngestResult {
  ok: boolean;
  status: XStatus | "DUPLICATE";
  message: string;
  pageId?: string;
  title?: string;
}

function requireConfig(cfg: XcondaConfig): void {
  const missing = missingConfig(cfg);
  if (missing.length) {
    throw new Error(`필수 설정이 없습니다: ${missing.join(", ")} — XCONDA_SETUP.md를 참고하세요.`);
  }
}

function isFailure(status: XStatus | "DUPLICATE") {
  return status === "DUPLICATE" || FAILURE_STATUSES.includes(status as XStatus);
}

/**
 * URL 하나를 받아 Notion에 적재하고(중복이면 건너뛰고), 기본적으로 즉시 처리까지 진행한다.
 * 관리자 "URL 수집" 폼(processNow=true)과 피드 수집(processNow=false)이 모두 여기를 통과한다.
 */
export async function ingestUrl(opts: {
  url: string;
  manualText?: string;
  authorHint?: string;
  processNow?: boolean;
}): Promise<IngestResult> {
  const cfg = await getXcondaConfig();
  requireConfig(cfg);

  const raw = (opts.url || "").trim();
  if (!/^https?:\/\//i.test(raw)) throw new Error("http(s)로 시작하는 URL을 입력하세요.");
  const url = canonicalizeUrl(raw);

  // 필터 1 — URL 중복 (collector_bot.py의 중복 검사에 해당)
  const dup = await findBySourceUrl(cfg, url);
  if (dup) {
    return {
      ok: false,
      status: "DUPLICATE",
      message: `이미 등록된 항목입니다 (상태: ${(dup.status && STATUS_LABELS[dup.status]) || "신규"}).`,
      pageId: dup.pageId,
      title: dup.title,
    };
  }

  const parsed = parseStatusUrl(url);
  const placeholderTitle = parsed
    ? `@${parsed.handle} 게시물`
    : `웹 콘텐츠 · ${(() => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      })()}`;

  const item = await createItem(cfg, {
    sourceUrl: url,
    title: placeholderTitle,
    author: (opts.authorHint || "").trim(),
    originalText: (opts.manualText || "").trim(),
    status: "NEW",
    createdAt: new Date(),
  });

  if (opts.processNow === false) {
    return { ok: true, status: "NEW", message: "수집했습니다. 다음 스케줄에서 처리됩니다.", pageId: item.pageId, title: item.title };
  }

  const r = await processItem(item.pageId).catch((e) => ({
    status: "EXTRACT_FAILED" as XStatus,
    message: e instanceof Error ? e.message : String(e),
    title: undefined as string | undefined,
  }));
  return {
    ok: !isFailure(r.status),
    status: r.status,
    message: r.message,
    pageId: item.pageId,
    title: r.title,
  };
}

interface ProcessResult {
  status: XStatus;
  message: string;
  title?: string;
}

/** NEW 상태 항목을 추출 → 요약까지 처리한다. 실패하면 상태를 남기고 다음 기회에 재시도할 수 있다. */
export async function processItem(pageId: string): Promise<ProcessResult> {
  const cfg = await getXcondaConfig();
  requireConfig(cfg);

  let item = await getItem(cfg, pageId);
  if (!item) throw new Error("Notion에서 항목을 찾을 수 없습니다.");
  if (item.status === "PUBLISHED") {
    return { status: "PUBLISHED", message: "이미 게시된 항목입니다.", title: item.title };
  }

  // 1) 본문 확보 (관리자가 직접 붙여넣은 원문이 있으면 건너뜀)
  if (!item.originalText.trim()) {
    const isX = Boolean(parseStatusUrl(item.sourceUrl));
    try {
      const post = isX ? await extractXPost(cfg, item.sourceUrl) : await extractWebPage(item.sourceUrl);
      const author = item.author || [post.handle, post.authorName].filter(Boolean).join(" · ");
      await updateItem(cfg, pageId, {
        originalText: post.text,
        author,
        sourceDate: post.createdAt,
        imageUrl: post.imageUrl,
        status: "EXTRACTED",
        note: `추출: ${post.strategy}`,
      });
      item = { ...item, originalText: post.text, author, sourceDate: post.createdAt, status: "EXTRACTED" };
    } catch (e) {
      const msg = truncate(e instanceof Error ? e.message : String(e), 1900);
      await updateItem(cfg, pageId, { status: "EXTRACT_FAILED", note: msg });
      return { status: "EXTRACT_FAILED", message: msg };
    }
  }

  // 필터 2 — 신선도 (collector_bot.py의 freshness 규칙에 해당)
  if (item.sourceDate && Date.now() - item.sourceDate.getTime() > cfg.maxAgeDays * 86_400_000) {
    const age = Math.floor((Date.now() - item.sourceDate.getTime()) / 86_400_000);
    await updateItem(cfg, pageId, { status: "IGNORED", note: `오래된 게시물 (약 ${age}일 전)` });
    return { status: "IGNORED", message: `${age}일 전 게시물이라 제외했습니다.` };
  }

  // 2) Gemini 요약
  let ai: SummarizeResult;
  try {
    ai = await getAIEngine(cfg).summarize({
      url: item.sourceUrl,
      author: item.author,
      date: item.sourceDate,
      text: item.originalText,
    });
  } catch (e) {
    const msg = truncate(e instanceof Error ? e.message : String(e), 1900);
    await updateItem(cfg, pageId, { status: "AI_FAILED", note: msg });
    return { status: "AI_FAILED", message: msg };
  }

  // 필터 3 — AI 관련성
  if (!ai.relevant) {
    const note = truncate(`AI 판단: 관련성 없음 — ${ai.reason}`, 1900);
    await updateItem(cfg, pageId, { status: "IGNORED", note, title: ai.title || item.title });
    return { status: "IGNORED", message: `AI 관련성 판단으로 제외했습니다: ${ai.reason}` };
  }

  // 필터 4 — 발행된 제목과의 유사도 (collector_bot.py의 title_similarity에 해당)
  const recent = await queryItems(cfg, { pageSize: TITLE_COMPARE_LIMIT });
  const similar = findSimilarTitle(
    ai.title,
    recent.filter((r) => r.pageId !== pageId && r.status !== "IGNORED" && r.status !== "NEW").map((r) => r.title),
  );
  if (similar) {
    await updateItem(cfg, pageId, { status: "IGNORED", note: `유사 제목 중복: "${similar}"`, title: ai.title });
    return { status: "IGNORED", message: `이미 다룬 내용과 유사합니다: "${similar}"` };
  }

  await updateItem(cfg, pageId, {
    title: ai.title,
    summary: ai.summary,
    announcement: ai.announcement,
    category: ai.category,
    tags: ai.tags,
    status: "SUMMARIZED",
    note: "",
  });

  if (cfg.autoPublish) {
    const p = await publishItem(pageId);
    return { status: p.ok ? "PUBLISHED" : "PUBLISH_FAILED", message: p.message, title: ai.title };
  }
  return { status: "SUMMARIZED", message: "요약 완료. 검토 후 '게시'를 누르세요. (설정에서 자동 게시 가능)", title: ai.title };
}

/** SUMMARIZED/READY 항목을 공지 페이지에 올리고 (선택) 메일 대기열에 넣는다. */
export async function publishItem(pageId: string): Promise<{ ok: boolean; message: string }> {
  const cfg = await getXcondaConfig();
  requireConfig(cfg);
  const item = await getItem(cfg, pageId);
  if (!item) throw new Error("Notion에서 항목을 찾을 수 없습니다.");

  const baseUrl = await resolveBaseUrl();
  const landingUrl = baseUrl ? `${baseUrl}/notices#${itemAnchor(pageId)}` : "";

  await updateItem(cfg, pageId, {
    published: true,
    landingUrl,
    status: "PUBLISHED",
    note: "",
  });

  // 메일 대기열(contents)에 추가 — 기존 시트 메일러의 예약 발송 흐름을 그대로 탄다.
  let mailNote = "";
  if (cfg.emailOnPublish) {
    const body = [item.announcement, item.summary, `원문: ${item.sourceUrl}`].filter(Boolean).join("\n\n");
    const inserted = await db
      .insert(contents)
      .values({
        key: `xconda:${pageId}`,
        rowNumber: 9_000_000, // 시트 대기열 뒤에 붙는다
        subject: item.title || "공지",
        body,
        link: item.sourceUrl,
        imageUrl: item.imageUrl || "",
        recipients: "",
        scheduledAt: null,
        rawSchedule: "",
        active: true,
        inSheet: false,
        source: "xconda",
        status: "pending",
      })
      .onConflictDoNothing({ target: contents.key })
      .returning();
    mailNote = inserted.length ? " 메일 대기열에 추가했습니다." : " (메일은 이미 대기열에 있습니다)";
  }

  revalidatePath("/notices");
  return {
    ok: true,
    message: `게시 완료${landingUrl ? ` — ${landingUrl}` : ""}${mailNote}`,
  };
}

/** 항목 상태를 직접 바꾼다 (재시도/제외) */
export async function setItemStatus(pageId: string, status: XStatus, note = ""): Promise<void> {
  const cfg = await getXcondaConfig();
  if (!cfg.notionToken || !cfg.notionDatabaseId) throw new Error("Notion 설정을 먼저 완료하세요.");
  await updateItem(cfg, pageId, { status, note });
}

let tickRunning = false;

/**
 * cron에서 주기적으로 호출하는 전체 틱:
 * 피드 확인 → NEW 처리 → (자동 게시 시) READY/SUMMARIZED 게시.
 * 메일 자동 발송(settings.enabled)과 무관하게 동작한다.
 */
export async function runXcondaTick(): Promise<string[]> {
  if (tickRunning) return ["[xconda] 이전 실행이 진행 중입니다."];
  tickRunning = true;
  const log: string[] = [];
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  try {
    const cfg = await getXcondaConfig();
    if (!cfg.enabled) return [];
    if (!cfg.notionToken || !cfg.notionDatabaseId || !cfg.geminiApiKey) return ["[xconda] Notion/Gemini 미설정 — 건너뜀"];

    // 1) 관제 계정 피드 확인
    try {
      const r = await checkDueAccounts(cfg);
      if (r.accounts) {
        log.push(
          `[xconda] 피드 확인 ${r.accounts}개 계정 · 신규 ${r.newItems}건${
            r.errors.length ? ` · 오류: ${r.errors.slice(0, 2).join(" / ")}` : ""
          }`,
        );
      }
    } catch (e) {
      log.push(`[xconda] 피드 확인 실패: ${msg(e)}`);
    }

    // 2) NEW 항목 처리 (추출 + 요약)
    try {
      const pending: XItem[] = await queryItems(cfg, { status: "NEW", pageSize: MAX_PROCESS_PER_TICK });
      for (const it of pending) {
        try {
          const r = await processItem(it.pageId);
          log.push(`[xconda] ${truncate(it.title, 40)} → ${STATUS_LABELS[r.status]}`);
        } catch (e) {
          log.push(`[xconda] 처리 실패 ${truncate(it.title, 40)}: ${msg(e)}`);
        }
      }
    } catch (e) {
      log.push(`[xconda] 신규 항목 조회 실패: ${msg(e)}`);
    }

    // 3) 자동 게시
    if (cfg.autoPublish) {
      for (const st of ["READY", "SUMMARIZED"] as const) {
        try {
          const ready = await queryItems(cfg, { status: st, pageSize: MAX_PROCESS_PER_TICK });
          for (const it of ready) {
            if (it.published) continue; // SUMMARIZED에 남아 있는 이전 발행분
            try {
              await publishItem(it.pageId);
              log.push(`[xconda] 자동 게시: ${truncate(it.title, 40)}`);
            } catch (e) {
              log.push(`[xconda] 게시 실패 ${truncate(it.title, 40)}: ${msg(e)}`);
            }
          }
        } catch (e) {
          log.push(`[xconda] ${st} 조회 실패: ${msg(e)}`);
        }
      }
    }
  } catch (e) {
    log.push(`[xconda] 오류: ${msg(e)}`);
  } finally {
    tickRunning = false;
  }
  return log;
}
