import { db } from "@/db";
import { contents, sendLogs, subscribers, type Content } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { sendMail } from "./mailer";
import {
  errorMessage,
  GMAIL_DAILY_SENDING_LIMIT_ERROR,
  isGmailDailySendingLimitError,
} from "./mail-errors";
import { getQuotaStatus, sentEmailsForContent } from "./quota";
import { getSettings } from "./settings";
import { splitEmails } from "./sheet";
import { renderEmail } from "./template";
import { formatKst } from "./time";

function unsubUrl(baseUrl: string, token?: string) {
  if (!baseUrl || !token) return undefined;
  return `${baseUrl.replace(/\/$/, "")}/unsubscribe?token=${token}`;
}

async function resolveRecipients(c: Content) {
  if (c.recipients.trim()) {
    const emails = Array.from(new Set(splitEmails(c.recipients)));
    if (!emails.length) return [];
    const known = await db.select().from(subscribers).where(inArray(subscribers.email, emails));
    const map = new Map(known.map((k) => [k.email, k]));
    return emails
      .filter((e) => map.get(e)?.active !== false)
      .map((e) => ({ email: e, name: map.get(e)?.name ?? "", token: map.get(e)?.token }));
  }
  // 수신자 열이 비어 있으면 전체 발송 — 활성화된 구독자 전원
  const all = await db.select().from(subscribers).where(eq(subscribers.active, true));
  return all.map((s) => ({ email: s.email, name: s.name, token: s.token as string | undefined }));
}

export interface SendResult {
  ok: boolean;
  sent?: number;
  failed?: number;
  total?: number;
  /** 이미 성공 로그가 있어 중복 방지로 건너뛴 인원 */
  alreadySent?: number;
  /** 하루 한도로 다음 발송 가능 시간으로 넘어간 인원 */
  deferred?: number;
  /** Gmail 550 5.4.5 한도 응답으로 발송이 일시 중단되었는지 여부 */
  providerBlocked?: boolean;
  error?: string | null;
  reason?: string;
}

/**
 * 콘텐츠를 수신자에게 발송한다. 앱 설정 한도를 지키고, Gmail의 일일 한도 응답(550 5.4.5)이
 * 오면 해당 배치를 즉시 중단한다. 발송하지 못한 수신자는 `partial` 상태로 남겨 재개한다.
 *
 * - 발송 상태와 관계없이 `sent` 로그가 있는 수신자는 제외한다. 수동 재시도도 미발송 주소만 대상으로 한다.
 * - `force`는 pending이 아닌 콘텐츠(발송 완료/실패/부분 발송)의 수동 재시도를 허용한다.
 */
export async function sendContent(contentId: number, force = false): Promise<SendResult> {
  const allowed = force ? ["pending", "failed", "sent", "partial"] : ["pending", "partial"];
  const claimed = await db
    .update(contents)
    .set({ status: "sending", updatedAt: new Date(), error: null })
    .where(and(eq(contents.id, contentId), inArray(contents.status, allowed)))
    .returning();
  const c = claimed[0];
  if (!c) return { ok: false, reason: "이미 발송 중이거나 발송할 수 없는 콘텐츠입니다." };

  const s = await getSettings();
  const recipients = await resolveRecipients(c);
  if (!recipients.length) {
    await db
      .update(contents)
      .set({ status: "failed", error: "수신자가 없습니다. 구독자를 추가하거나 '수신자' 열을 확인하세요.", updatedAt: new Date() })
      .where(eq(contents.id, c.id));
    return { ok: false, total: 0, error: "수신자가 없습니다. 구독자를 추가하거나 '수신자' 열을 확인하세요." };
  }

  // 부분 발송, 수동 재시도, 대기 상태 복구 등 어떤 경로에서도 성공한 주소는 다시 보내지 않는다.
  const delivered = await sentEmailsForContent(contentId);
  const alreadySent = recipients.filter((r) => delivered.has(r.email)).length;
  const targets = recipients.filter((r) => !delivered.has(r.email));
  if (!targets.length) {
    await db
      .update(contents)
      .set({
        status: "sent",
        sentCount: alreadySent,
        failCount: 0,
        error: null,
        updatedAt: new Date(),
        sentAt: c.sentAt ?? new Date(),
      })
      .where(eq(contents.id, c.id));
    return { ok: true, sent: 0, total: recipients.length, alreadySent, deferred: 0 };
  }

  // 제공자에서 Gmail 550 5.4.5가 확인된 뒤에는 24시간 동안 재시도하지 않는다.
  const quota = await getQuotaStatus(s);
  if (quota.providerBlocked) {
    const deferred = targets.length;
    const error = `Gmail 일일 발송 한도(550 5.4.5) 초과가 감지되어 발송을 중지했습니다. ${
      quota.providerBlockedUntil ? `미발송분은 ${formatKst(quota.providerBlockedUntil)} 이후 재개됩니다.` : "24시간 후 재개됩니다."
    }`;
    await db
      .update(contents)
      .set({ status: "partial", error, updatedAt: new Date() })
      .where(eq(contents.id, c.id));
    return {
      ok: false,
      sent: 0,
      total: recipients.length,
      alreadySent,
      deferred,
      providerBlocked: true,
      error,
      reason: error,
    };
  }

  // 앱 설정 한도 — 남은 만큼만 오늘 보내고 나머지는 다음 날로 넘긴다.
  let deferred = quota.limit > 0 && targets.length > quota.remaining ? targets.length - quota.remaining : 0;
  const batch = deferred > 0 ? targets.slice(0, quota.remaining) : targets;

  if (!batch.length) {
    // 오늘 한도 소진 — 내일 이어서 보내도록 부분 발송 상태로 보관한다.
    await db
      .update(contents)
      .set({
        status: "partial",
        error: `오늘 발송 한도(${quota.limit}통)를 모두 사용했습니다 — 남은 ${targets.length}명은 내일 이어서 발송됩니다.`,
        updatedAt: new Date(),
      })
      .where(eq(contents.id, c.id));
    return {
      ok: false,
      sent: 0,
      total: recipients.length,
      alreadySent,
      deferred: targets.length,
      reason: `오늘 발송 한도(${quota.limit}통)를 모두 사용했습니다. 남은 ${targets.length}명은 내일 이어서 발송됩니다.`,
    };
  }

  let sent = 0;
  let failed = 0;
  let providerBlocked = false;
  let lastError: string | null = null;

  for (const r of batch) {
    const unsubscribeUrl = unsubUrl(s.baseUrl, r.token);
    const mail = renderEmail({
      subject: c.subject,
      body: c.body,
      link: c.link,
      imageUrl: c.imageUrl,
      fromName: s.fromName,
      name: r.name,
      email: r.email,
      unsubscribeUrl,
    });
    try {
      const { provider } = await sendMail({
        to: r.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        fromName: s.fromName,
        unsubscribeUrl,
      });
      sent++;
      await db.insert(sendLogs).values({
        contentId: c.id,
        subject: mail.subject,
        email: r.email,
        status: "sent",
        provider,
      });
    } catch (e) {
      failed++;
      providerBlocked = isGmailDailySendingLimitError(e);
      lastError = providerBlocked ? GMAIL_DAILY_SENDING_LIMIT_ERROR : errorMessage(e);
      await db.insert(sendLogs).values({
        contentId: c.id,
        subject: mail.subject,
        email: r.email,
        status: "failed",
        error: lastError,
      });
      // A provider-wide quota rejection is not recipient-specific: stop immediately instead of
      // generating one identical failure for every remaining address.
      if (providerBlocked) break;
    }
  }

  // If Gmail rejected the batch, all addresses not confirmed sent remain eligible for retry.
  // The sent log is the source of truth, so a partially-sent campaign will resume without duplicates.
  if (providerBlocked) deferred = Math.max(0, targets.length - sent);

  // 이 콘텐츠에서 이미 성공한 수신자 수는 기존 로그를 기준으로 누적한다.
  const baseSent = alreadySent;
  const status = deferred > 0 ? "partial" : sent > 0 ? "sent" : "failed";
  const error = providerBlocked
    ? `Gmail 일일 발송 한도(550 5.4.5) 초과 — ${deferred}명은 발송을 멈췄으며 24시간 후 자동으로 이어서 발송됩니다.`
    : deferred > 0
      ? `${baseSent + sent}명 발송 완료 — 남은 ${deferred}명은 내일 이어서 발송됩니다.`
      : failed > 0
        ? `${failed}건 실패: ${lastError}`
        : null;
  await db
    .update(contents)
    .set({
      status,
      sentAt: sent > 0 ? new Date() : c.sentAt,
      sentCount: baseSent + sent,
      failCount: failed,
      error,
      updatedAt: new Date(),
    })
    .where(eq(contents.id, c.id));

  return {
    ok: sent > 0,
    sent,
    failed,
    total: recipients.length,
    alreadySent,
    deferred,
    providerBlocked,
    error,
    reason: providerBlocked ? error ?? GMAIL_DAILY_SENDING_LIMIT_ERROR : undefined,
  };
}

export async function sendTest(contentId: number, to: string) {
  const [c] = await db.select().from(contents).where(eq(contents.id, contentId));
  if (!c) throw new Error("콘텐츠를 찾을 수 없습니다.");
  const s = await getSettings();
  const quota = await getQuotaStatus(s);
  if (quota.providerBlocked) {
    const until = quota.providerBlockedUntil ? formatKst(quota.providerBlockedUntil) : "24시간 후";
    throw new Error(`Gmail 일일 발송 한도(550 5.4.5) 응답으로 발송이 중지되어 있습니다. ${until} 이후 다시 시도하세요.`);
  }
  const mail = renderEmail({
    subject: `[테스트] ${c.subject}`,
    body: c.body,
    link: c.link,
    imageUrl: c.imageUrl,
    fromName: s.fromName,
    email: to,
  });
  try {
    const { provider } = await sendMail({ to, ...mail, fromName: s.fromName });
    await db.insert(sendLogs).values({ contentId: c.id, subject: mail.subject, email: to, status: "test", provider });
    return provider;
  } catch (e) {
    const msg = isGmailDailySendingLimitError(e) ? GMAIL_DAILY_SENDING_LIMIT_ERROR : errorMessage(e);
    await db.insert(sendLogs).values({ contentId: c.id, subject: mail.subject, email: to, status: "failed", error: msg });
    throw e;
  }
}
