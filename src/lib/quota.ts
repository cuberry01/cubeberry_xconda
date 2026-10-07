// 하루 발송 한도 관리.
//
// 앱 자체 한도는 오늘 발송 시도 로그로 계산한다. Gmail 등 발송 제공자는 별도의 한도를
// 적용하므로, Gmail 550 5.4.5 응답이 있으면 해당 오류 시점부터 24시간 발송을 멈춘다.
// 앱 한도는 한국 시간 자정에 초기화되며, 서버 재시작이나 재발송에도 로그 기준으로 정확하다.

import { db } from "@/db";
import { sendLogs, type Settings } from "@/db/schema";
import { and, count, desc, eq, gte, ilike, inArray, ne } from "drizzle-orm";
import {
  GMAIL_DAILY_SENDING_LIMIT_COOLDOWN_MS,
  GMAIL_DAILY_SENDING_LIMIT_MARKER,
} from "./mail-errors";
import { getProvider } from "./mailer";
import { getSettings } from "./settings";
import { fromKst, kstParts } from "./time";

export interface QuotaStatus {
  /** 앱 자체 하루 한도. 0이면 앱 한도 없음 */
  limit: number;
  /** 오늘(한국 시간 자정 이후) 발송 시도 수 — 성공 + 실패 */
  used: number;
  /** 오늘 남은 앱 설정 한도. 무제한이면 Infinity (단, 제공자 차단 중이면 0) */
  remaining: number;
  unlimited: boolean;
  /** Gmail이 550 5.4.5 일일 발송 한도를 응답해 쿨다운 중인지 여부 */
  providerBlocked: boolean;
  /** Gmail 한도 거부 시점부터 24시간이 되는 시각 */
  providerBlockedUntil: Date | null;
}

/** 오늘 한국 시간 00:00 시점 */
export function kstTodayStart(now: Date = new Date()): Date {
  const p = kstParts(now);
  return fromKst(p.year, p.month, p.day);
}

/** 오늘 실제 발송 시도 수 (성공 + 실패). 테스트 모드 로그는 실제 제공자 연결 시 제외한다. */
export async function sentTodayCount(now: Date = new Date()): Promise<number> {
  const attempts = and(gte(sendLogs.createdAt, kstTodayStart(now)), inArray(sendLogs.status, ["sent", "failed"]));
  const where = getProvider() === "test" ? attempts : and(attempts, ne(sendLogs.provider, "test"));
  const [{ value }] = await db.select({ value: count() }).from(sendLogs).where(where);
  return value;
}

export async function getQuotaStatus(s?: Settings, now: Date = new Date()): Promise<QuotaStatus> {
  const settings = s ?? (await getSettings());
  const limit = Math.max(0, settings.dailyLimit ?? 0);
  const smtpHost = (process.env.SMTP_HOST || "smtp.gmail.com").trim().toLowerCase();
  const usingGmailSmtp =
    getProvider() === "smtp" &&
    (smtpHost === "gmail.com" || smtpHost.endsWith(".gmail.com") || smtpHost === "googlemail.com" || smtpHost.endsWith(".googlemail.com"));
  const gmailLimitErrors = usingGmailSmtp
    ? db
        .select({ createdAt: sendLogs.createdAt })
        .from(sendLogs)
        .where(
          and(
            eq(sendLogs.status, "failed"),
            gte(sendLogs.createdAt, new Date(now.getTime() - GMAIL_DAILY_SENDING_LIMIT_COOLDOWN_MS)),
            ilike(sendLogs.error, `%${GMAIL_DAILY_SENDING_LIMIT_MARKER}%`),
          ),
        )
        .orderBy(desc(sendLogs.createdAt))
        .limit(1)
    : Promise.resolve([] as { createdAt: Date }[]);
  const [used, [latestGmailLimitError]] = await Promise.all([sentTodayCount(now), gmailLimitErrors]);
  const providerBlockedUntil = latestGmailLimitError
    ? new Date(latestGmailLimitError.createdAt.getTime() + GMAIL_DAILY_SENDING_LIMIT_COOLDOWN_MS)
    : null;
  const providerBlocked = Boolean(providerBlockedUntil && providerBlockedUntil.getTime() > now.getTime());

  return {
    limit,
    used,
    remaining: providerBlocked ? 0 : limit > 0 ? Math.max(0, limit - used) : Number.POSITIVE_INFINITY,
    unlimited: limit <= 0,
    providerBlocked,
    providerBlockedUntil: providerBlocked ? providerBlockedUntil : null,
  };
}

/** 특정 콘텐츠에서 성공 로그가 있는 이메일 목록. 테스트 모드 성공은 실제 제공자가 설정되면 제외한다. */
export async function sentEmailsForContent(contentId: number): Promise<Set<string>> {
  const successfulLogs = and(eq(sendLogs.contentId, contentId), eq(sendLogs.status, "sent"));
  const where =
    getProvider() === "test"
      ? successfulLogs
      : and(successfulLogs, ne(sendLogs.provider, "test"));
  const rows = await db.select({ email: sendLogs.email }).from(sendLogs).where(where);
  return new Set(rows.map((r) => r.email));
}
