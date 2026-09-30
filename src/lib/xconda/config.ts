// Xconda 설정 리졸버 — blog-writer의 ConfigResolver 패턴 참고.
// 우선순위: DB(settings 테이블) > 환경변수 > 기본값.
// 시크릿(NOTION_TOKEN, GEMINI_API_KEY)은 환경변수로만 관리한다.

import { getSettings } from "@/lib/settings";

export interface XcondaConfig {
  notionToken: string;
  notionDatabaseId: string;
  geminiApiKey: string;
  geminiModel: string;
  /** RSSHub 등 RSS 브릿지 주소 (끝 슬래시 제거) */
  rsshubBase: string;
  autoPublish: boolean;
  emailOnPublish: boolean;
  /** 이보다 오래된 게시물은 자동으로 IGNORED 처리 */
  maxAgeDays: number;
  /** 파이프라인 마스터 스위치 (cron에서 참조) */
  enabled: boolean;
}

export async function getXcondaConfig(): Promise<XcondaConfig> {
  const s = await getSettings();
  return {
    notionToken: (process.env.NOTION_TOKEN || "").trim(),
    notionDatabaseId: (s.xNotionDatabaseId || process.env.NOTION_DATABASE_ID || "").trim(),
    geminiApiKey: (process.env.GEMINI_API_KEY || "").trim(),
    geminiModel: (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim(),
    rsshubBase: (s.xRsshubBase || process.env.RSSHUB_BASE_URL || "").trim().replace(/\/+$/, ""),
    autoPublish: s.xAutoPublish,
    emailOnPublish: s.xEmailOnPublish,
    maxAgeDays: Math.min(Math.max(s.xMaxAgeDays || 14, 1), 365),
    enabled: s.xEnabled,
  };
}

/** Notion DB ID는 settings 테이블 또는 환경변수에 있다 */
export async function resolveNotionDatabaseId(): Promise<string> {
  const s = await getSettings();
  return (s.xNotionDatabaseId || process.env.NOTION_DATABASE_ID || "").trim();
}

/** 발행 시 landing URL prefix — settings.base_url이 비어 있으면 요청 헤더에서 추론 */
export async function resolveBaseUrl(): Promise<string> {
  const s = await getSettings();
  if (s.baseUrl) return s.baseUrl;
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host && !host.startsWith("localhost") && !host.startsWith("127.")) {
      const proto = h.get("x-forwarded-proto") || "https";
      return `${proto}://${host}`;
    }
  } catch {
    // 요청 컨텍스트 밖(내장 스케줄러 등)에서는 헤더를 읽을 수 없다
  }
  return "";
}

export function missingConfig(cfg: XcondaConfig): string[] {
  const missing: string[] = [];
  if (!cfg.notionToken) missing.push("NOTION_TOKEN (환경변수)");
  if (!cfg.notionDatabaseId) missing.push("Notion DB ID (X 수집 설정)");
  if (!cfg.geminiApiKey) missing.push("GEMINI_API_KEY (환경변수)");
  return missing;
}
