// X 게시물 / 일반 웹페이지 본문 추출.
// 유료 X API 없이 읽을 수 있는 공개 엔드포인트를 여러 개 준비하고
// 순서대로 시도한다 (실패 시 다음 전략). 마지막 수단은 관리자 UI에서 직접 붙여넣은 원문.

import type { XcondaConfig } from "./config";
import { parseStatusUrl } from "./similarity";
import type { ExtractedPost } from "./types";
import { pick, toDate } from "./util";

export const FETCH_UA = "Mozilla/5.0 (compatible; XcondaBot/1.0)";

async function httpGet(url: string, timeoutMs = 12_000): Promise<Response> {
  const res = await fetch(url, {
    headers: { "User-Agent": FETCH_UA, Accept: "*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function getJson(url: string, timeoutMs = 12_000): Promise<unknown> {
  const res = await httpGet(url, timeoutMs);
  return res.json();
}

async function getText(url: string, timeoutMs = 15_000): Promise<string> {
  const res = await httpGet(url, timeoutMs);
  return res.text();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── 전략 1: FxTwitter 공개 API (인증 불필요, 깔끔한 JSON) ──────

async function viaFxtwitter(handle: string, id: string): Promise<ExtractedPost> {
  const data = await getJson(`https://api.fxtwitter.com/${handle}/status/${id}`);
  const tweet = pick(data, "tweet") as Record<string, unknown> | undefined;
  const text = String(pick(tweet, "text") ?? "");
  if (!tweet || !text.trim()) throw new Error("본문 없음");
  const author = (pick(tweet, "author") ?? {}) as Record<string, unknown>;
  const photos = (pick(tweet, "media.photos") ?? []) as { url?: string }[];
  const quote = pick(tweet, "quote.text");
  const screenName = String(author.screen_name ?? handle);
  return {
    handle: `@${screenName}`,
    authorName: String(author.name ?? ""),
    text: quote ? `${text}\n\n[인용 게시물] ${quote}` : text,
    createdAt: toDate(pick(tweet, "created_at")),
    imageUrl: photos[0]?.url ?? "",
    strategy: "fxtwitter",
  };
}

// ─── 전략 2: syndication CDN (트위터 위젯용 엔드포인트) ─────────

async function viaSyndication(handle: string, id: string): Promise<ExtractedPost> {
  // token 파라미터는 임의 값으로도 통과한다
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const token = Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const data = await getJson(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=ko&token=${token}`);
  const text = String(pick(data, "legacy.text") ?? pick(data, "text") ?? pick(data, "full_text") ?? "");
  if (!text.trim()) throw new Error("본문 없음");
  const screenName = String(
    pick(data, "core.user_results.result.legacy.screen_name") ?? pick(data, "user.screen_name") ?? handle,
  );
  const authorName = String(pick(data, "core.user_results.result.legacy.name") ?? pick(data, "user.name") ?? "");
  const media = (pick(data, "mediaDetails") ?? pick(data, "media.details") ?? []) as { media_url_https?: string }[];
  const quoted = pick(data, "quoted_tweet_result.result.legacy.text") ?? pick(data, "quoted_tweet_result.result.legacy.full_text");
  return {
    handle: `@${screenName}`,
    authorName,
    text: quoted ? `${text}\n\n[인용 게시물] ${quoted}` : text,
    createdAt: toDate(pick(data, "legacy.created_at") ?? pick(data, "created_at")),
    imageUrl: media[0]?.media_url_https ?? "",
    strategy: "syndication",
  };
}

// ─── 전략 3: oEmbed (게시 HTML에서 태그만 벗겨냄) ──────────────

async function viaOembed(handle: string, id: string): Promise<ExtractedPost> {
  const url = `https://publish.twitter.com/oembed?url=${encodeURIComponent(
    `https://x.com/${handle}/status/${id}`,
  )}&dnt=true&omit_script=1`;
  const data = (await getJson(url)) as { html?: string; author_name?: string; author_url?: string };
  const html = data?.html ?? "";
  if (!html) throw new Error("응답 없음");
  // footer "— 이름 (@handle) 날짜" 부분을 제거
  const text = stripHtml(html).split(/\n?\s*—\s/)[0].trim();
  if (!text) throw new Error("본문 없음");
  const screenName = (data.author_url ?? "").match(/(\w{1,20})$/)?.[1] ?? handle;
  return {
    handle: `@${screenName}`,
    authorName: data.author_name ?? "",
    text,
    createdAt: null,
    imageUrl: "",
    strategy: "oembed",
  };
}

// ─── 전략 4: RSSHub 인스턴스의 status 라우트 ───────────────────

async function viaRsshubStatus(cfg: XcondaConfig, handle: string, id: string): Promise<ExtractedPost> {
  if (!cfg.rsshubBase) throw new Error("RSSHub 미설정");
  const xml = await getText(`${cfg.rsshubBase}/twitter/status/${handle}/${id}`);
  const description = xml.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "";
  const text = stripHtml(description);
  if (!text.trim()) throw new Error("본문 없음");
  return {
    handle: `@${handle}`,
    authorName: "",
    text,
    createdAt: null,
    imageUrl: "",
    strategy: "rsshub",
  };
}

// ─── X 게시물 추출 (ingest(url)의 Extract 단계) ────────────────

export async function extractXPost(cfg: XcondaConfig, url: string, manualText?: string): Promise<ExtractedPost> {
  const parsed = parseStatusUrl(url);
  if (!parsed) throw new Error(`X 게시물 URL이 아닙니다: ${url}`);
  const { handle, id } = parsed;

  // 관리자가 원문을 직접 붙여넣은 경우 — 네트워크 없이 즉시 통과
  if (manualText && manualText.trim()) {
    return {
      handle: `@${handle}`,
      authorName: "",
      text: manualText.trim(),
      createdAt: null,
      imageUrl: "",
      strategy: "manual",
    };
  }

  const strategies: [string, () => Promise<ExtractedPost>][] = [
    ["fxtwitter", () => viaFxtwitter(handle, id)],
    ["syndication", () => viaSyndication(handle, id)],
    ["oembed", () => viaOembed(handle, id)],
    ["rsshub", () => viaRsshubStatus(cfg, handle, id)],
  ];
  const errors: string[] = [];
  for (const [name, fn] of strategies) {
    try {
      const post = await fn();
      if (post.text.trim()) return post;
      errors.push(`${name}: 빈 본문`);
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(
    `X 게시물 본문을 가져오지 못했습니다 (${errors.join(" / ")}). 관리자 화면에서 원문을 직접 붙여넣어 다시 시도할 수 있습니다.`,
  );
}

// ─── 일반 웹페이지 추출 (X가 아닌 URL을 붙여넣었을 때) ───────────

export async function extractWebPage(url: string): Promise<ExtractedPost> {
  const html = (await getText(url)).slice(0, 500_000);
  const meta = (prop: string) => {
    const m =
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i")) ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"));
    return m?.[1] ? stripHtml(m[1]) : "";
  };
  const pageTitle =
    meta("og:title") || stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || new URL(url).hostname;
  const description = meta("og:description");
  const body = stripHtml(html).slice(0, 12_000);
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (!body && !description) throw new Error("페이지에서 본문을 읽지 못했습니다.");
  return {
    handle: "",
    authorName: meta("og:site_name") || host,
    text: description ? `${pageTitle}\n\n${description}\n\n${body}` : `${pageTitle}\n\n${body}`,
    createdAt: toDate(html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1]),
    imageUrl: meta("og:image"),
    strategy: "web",
  };
}
