// 하루 발송 한도 관리.
//
// Gmail 무료 계정은 하루 약 500통 제한이 있으므로 기본 한도는 500통이다.
// 한도는 한국 시간 자정에 초기화되며, 오늘 발송량(시도 기준)은 발송 기록
// (send_logs)에서 직접 세어 계산한다 — 서버 재시작이나 재발송에도 정확하다.

import { db } from "@/db";
import { sendLogs, type Settings } from "@/db/schema";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { getSettings } from "./settings";
import { fromKst, kstParts } from "./time";

export interface QuotaStatus {
  /** 하루 한도. 0이면 무제한 */
  limit: number;
  /** 오늘(한국 시간 자정 이후) 발송 시도 수 — 성공 + 실패 */
  used: number;
  /** 오늘 남은 한도. 무제한이면 Infinity */
  remaining: number;
  unlimited: boolean;
}

/** 오늘 한국 시간 00:00 시점 */
export function kstTodayStart(now: Date = new Date()): Date {
  const p = kstParts(now);
  return fromKst(p.year, p.month, p.day);
}

/** 오늘 발송 시도 수 (성공 + 실패). 메일 제공자 쿼터는 실패 건도 소모한다. */
export async function sentTodayCount(now: Date = new Date()): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(sendLogs)
    .where(and(gte(sendLogs.createdAt, kstTodayStart(now)), inArray(sendLogs.status, ["sent", "failed"])));
  return value;
}

export async function getQuotaStatus(s?: Settings, now: Date = new Date()): Promise<QuotaStatus> {
  const settings = s ?? (await getSettings());
  const limit = Math.max(0, settings.dailyLimit ?? 0);
  const used = await sentTodayCount(now);
  return {
    limit,
    used,
    remaining: limit > 0 ? Math.max(0, limit - used) : Number.POSITIVE_INFINITY,
    unlimited: limit <= 0,
  };
}

/** 특정 콘텐츠를 이미 받은 이메일 목록 (부분 발송 이어 보내기에서 중복 발송 방지용) */
export async function sentEmailsForContent(contentId: number): Promise<Set<string>> {
  const rows = await db
    .select({ email: sendLogs.email })
    .from(sendLogs)
    .where(and(eq(sendLogs.contentId, contentId), eq(sendLogs.status, "sent")));
  return new Set(rows.map((r) => r.email));
}
