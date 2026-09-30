// 관제 계정(특정 X 계정) 자동 모니터링 — RSSHub/Nitter 등 RSS 브릿지 피드를 읽어
// 새 게시물 URL을 Notion에 NEW로 적재한다. 브릿지가 불안정해도 수동 URL 수집은 영향받지 않는다.

import { db } from "@/db";
import { xAccounts, type XAccount } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { XcondaConfig } from "./config";
import { createItem, findBySourceUrl } from "./notion";
import { canonicalizeUrl, parseStatusUrl } from "./similarity";
import { asArray, toDate } from "./util";
import { FETCH_UA } from "./extract";

/** 계정당 피드 확인 주기 (분) */
export const FEED_CHECK_INTERVAL_MIN = 15;
/** 계정당 한 번에 만들 수 있는 신규 항목 상한 */
const MAX_NEW_PER_ACCOUNT = 5;

export interface FeedEntry {
  guid: string;
  link: string;
  title: string;
  description: string;
  pubDate: Date | null;
}

// fast-xml-parser는 의존성 1개뿐인 표준 XML 파서 — 정규식 파싱보다 견고하다.
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });

/** RSS 2.0 / Atom 파싱 (link 속성 포함) */
export function parseFeed(xml: string): FeedEntry[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const entries: FeedEntry[] = [];

  const rss = doc.rss as Record<string, unknown> | undefined;
  const ch = asArray(rss?.channel as unknown)[0] as Record<string, unknown> | undefined;
  if (ch) {
    for (const it of asArray(ch.item as unknown)) {
      const o = it as Record<string, unknown>;
      const link = String(o.link ?? "");
      const guid = String(o.guid ?? link);
      if (!link && !guid) continue;
      entries.push({
        guid,
        link,
        title: String(o.title ?? ""),
        description: String(o.description ?? ""),
        pubDate: toDate(o.pubDate ?? o.published ?? o["dc:date"]),
      });
    }
  }

  if (!entries.length) {
    const feed = asArray(doc.feed)[0] as Record<string, unknown> | undefined;
    if (feed) {
      for (const e of asArray(feed.entry as unknown)) {
        const o = e as Record<string, unknown>;
        const links = asArray(o.link as unknown).map((l) => l as Record<string, unknown>);
        const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
        const link = String(alt?.["@_href"] ?? "");
        const guid = String(o.id ?? link);
        if (!link && !guid) continue;
        const title = typeof o.title === "object" ? String((o.title as Record<string, unknown>)["#text"] ?? "") : String(o.title ?? "");
        entries.push({
          guid,
          link,
          title,
          description: String(o.summary ?? o.content ?? ""),
          pubDate: toDate(o.updated ?? o.published),
        });
      }
    }
  }

  return entries;
}

function firstStatusLinks(entries: FeedEntry[]): FeedEntry[] {
  const out: FeedEntry[] = [];
  for (const e of entries) {
    const link = canonicalizeUrl(e.link || e.guid);
    if (parseStatusUrl(link)) out.push({ ...e, link });
  }
  return out;
}

export interface CheckResult {
  newItems: number;
  error?: string;
}

/** 계정 하나를 확인하고 새 게시물을 Notion에 적재한다. */
export async function checkAccount(cfg: XcondaConfig, account: XAccount): Promise<CheckResult> {
  const handle = account.handle.replace(/^@/, "");
  const feedUrl =
    account.feedUrl.trim() || (cfg.rsshubBase ? `${cfg.rsshubBase}/twitter/user/${handle}` : "");

  const mark = (patch: Partial<typeof xAccounts.$inferInsert>) =>
    db.update(xAccounts).set(patch).where(eq(xAccounts.id, account.id));

  if (!feedUrl) {
    const error = "피드 URL 없음 — RSSHub 주소를 설정하거나 개별 피드 URL을 입력하세요";
    await mark({ lastError: error, lastCheckedAt: new Date() });
    return { newItems: 0, error };
  }

  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": FETCH_UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const all = parseFeed(xml);
    if (!all.length) throw new Error("피드에 항목이 없습니다");
    const items = firstStatusLinks([...all]);
    if (!items.length) throw new Error("피드에서 X 게시물을 찾지 못했습니다");

    // 최신 항목부터 처리
    const sorted = items.sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));
    const now = Date.now();
    let newItems = 0;
    for (const e of sorted) {
      if (newItems >= MAX_NEW_PER_ACCOUNT) break;
      // 지난번에 확인한 마지막 항목이면 그 이후는 이미 처리한 것
      if (account.lastGuid && (e.guid === account.lastGuid || e.link === account.lastGuid)) break;
      // 너무 오래된 게시물은 건너뛴다 (Notion에도 만들지 않음)
      if (e.pubDate && now - e.pubDate.getTime() > cfg.maxAgeDays * 86_400_000) continue;
      // URL 중복 검사
      const dup = await findBySourceUrl(cfg, e.link);
      if (dup) continue;
      await createItem(cfg, {
        sourceUrl: e.link,
        title: `@${handle} 게시물`,
        sourceDate: e.pubDate,
        note: `피드 수집(@${handle})`,
      });
      newItems++;
    }
    await mark({
      lastCheckedAt: new Date(),
      lastGuid: sorted[0]?.guid ?? sorted[0]?.link ?? "",
      lastError: null,
    });
    return { newItems };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await mark({ lastCheckedAt: new Date(), lastError: error });
    return { newItems: 0, error };
  }
}

/** 확인 주기가 지난 활성 계정만 골라 확인한다 (cron에서 호출). */
export async function checkDueAccounts(
  cfg: XcondaConfig,
): Promise<{ accounts: number; newItems: number; errors: string[] }> {
  const rows = await db.select().from(xAccounts).where(eq(xAccounts.enabled, true));
  const now = Date.now();
  const due = rows.filter(
    (a) => !a.lastCheckedAt || now - a.lastCheckedAt.getTime() >= FEED_CHECK_INTERVAL_MIN * 60_000,
  );
  const errors: string[] = [];
  let newItems = 0;
  for (const a of due) {
    const r = await checkAccount(cfg, a);
    newItems += r.newItems;
    if (r.error) errors.push(`@${a.handle}: ${r.error}`);
  }
  return { accounts: due.length, newItems, errors };
}
