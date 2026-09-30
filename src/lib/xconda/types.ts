// Xconda — X(트위터) 게시물 → 본문 추출 → Gemini 요약 → Notion → 공지 페이지
//
// 상태 흐름 (blog-writer의 Collector → Filter → AI 구조를 참고해 단순화):
//   NEW → EXTRACTED → SUMMARIZED → READY → PUBLISHED
//   실패: EXTRACT_FAILED / AI_FAILED / PUBLISH_FAILED
//   제외: IGNORED (중복, 오래됨, AI 관련성 없음)

export const X_STATUSES = [
  "NEW",
  "EXTRACTED",
  "SUMMARIZED",
  "READY",
  "PUBLISHED",
  "EXTRACT_FAILED",
  "AI_FAILED",
  "PUBLISH_FAILED",
  "IGNORED",
] as const;

export type XStatus = (typeof X_STATUSES)[number];

export const STATUS_LABELS: Record<XStatus, string> = {
  NEW: "신규",
  EXTRACTED: "추출됨",
  SUMMARIZED: "요약됨",
  READY: "발행 대기",
  PUBLISHED: "게시됨",
  EXTRACT_FAILED: "추출 실패",
  AI_FAILED: "AI 실패",
  PUBLISH_FAILED: "게시 실패",
  IGNORED: "제외됨",
};

export const FAILURE_STATUSES: XStatus[] = ["EXTRACT_FAILED", "AI_FAILED", "PUBLISH_FAILED"];

export function isXStatus(v: string): v is XStatus {
  return (X_STATUSES as readonly string[]).includes(v);
}

/** Notion 항목 (Xconda Content DB 1행) */
export interface XItem {
  pageId: string;
  notionUrl: string;
  title: string;
  sourceUrl: string;
  author: string;
  originalText: string;
  summary: string;
  announcement: string;
  category: string;
  tags: string[];
  imageUrl: string;
  status: XStatus | "";
  published: boolean;
  landingUrl: string;
  sourceDate: Date | null;
  createdAt: Date | null;
  note: string;
}

/** 추출된 게시물 */
export interface ExtractedPost {
  /** @screen_name (X URL이 아니면 빈 문자열) */
  handle: string;
  authorName: string;
  text: string;
  createdAt: Date | null;
  imageUrl: string;
  /** 사용한 추출 전략 (fxtwitter / syndication / oembed / rsshub / manual / web) */
  strategy: string;
}

/** 공지 페이지의 개별 항목 앵커 — pipeline(landing URL)과 /notices 페이지가 공유 */
export function itemAnchor(pageId: string) {
  return `item-${pageId.replace(/-/g, "").slice(0, 12)}`;
}
