// URL 정규화 + 제목 유사도 — blog-writer collector_bot.py의
// 중복 검사(URL exact) / 발행 제목 유사도(SequenceMatcher) 규칙을 가져온 것.

const X_HOSTS = /(^|\.)((x|twitter|fxtwitter|vxtwitter|fixupx|fixvx)\.com)$/i;
const NITTER_HOST = /(^|\.)nitter\./i;

/**
 * URL을 정규화한다.
 * - X/트위터/Nitter/FxTwitter 게시물 → https://x.com/<handle>/status/<id>
 *   (트래킹 파라미터, /photo/1 등 경로 접미사, twitter.com ↔ x.com 차이 모두 흡수)
 * - 그 외 URL → utm_* 등 추적 파라미터와 해시 제거
 */
export function canonicalizeUrl(raw: string): string {
  const trimmed = (raw || "").trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return trimmed;

  const host = u.hostname.toLowerCase();
  if (X_HOSTS.test(host) || NITTER_HOST.test(host)) {
    const m = u.pathname.match(/^\/([A-Za-z0-9_]{1,20})\/status(?:es)?\/(\d{5,25})/);
    if (m) return `https://x.com/${m[1].toLowerCase()}/status/${m[2]}`;
  }

  const cp = new URL(u.toString());
  const drop: string[] = [];
  cp.searchParams.forEach((_v, k) => {
    if (/^(utm_|ref$|ref_|fbclid|gclid|igshid|si$)/i.test(k)) drop.push(k);
  });
  for (const k of drop) cp.searchParams.delete(k);
  cp.hash = "";
  return cp.toString();
}

/** X 게시물 URL이면 {handle, id}, 아니면 null */
export function parseStatusUrl(url: string): { handle: string; id: string } | null {
  const m = canonicalizeUrl(url).match(/^https:\/\/x\.com\/([A-Za-z0-9_]{1,20})\/status\/(\d{5,25})$/);
  return m ? { handle: m[1], id: m[2] } : null;
}

/** 문자열을 정규화한다 (소문자 + 공백 축소) */
function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice 계수 (bigram) — 1.0이면 완전히 동일 */
export function diceSimilarity(a: string, b: string): number {
  const A = bigrams(norm(a));
  const B = bigrams(norm(b));
  let totalA = 0;
  let totalB = 0;
  for (const n of A.values()) totalA += n;
  for (const n of B.values()) totalB += n;
  if (!totalA || !totalB) return 0;
  let overlap = 0;
  for (const [g, n] of A) overlap += Math.min(n, B.get(g) ?? 0);
  return (2 * overlap) / (totalA + totalB);
}

/** 제목이 기존 항목들과 유사한지 (기본 임계값 0.8 — collector_bot.py와 동일) */
export function findSimilarTitle(title: string, existing: string[], threshold = 0.8): string | null {
  for (const t of existing) {
    if (diceSimilarity(title, t) >= threshold) return t;
  }
  return null;
}
