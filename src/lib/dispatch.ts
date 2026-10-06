import { db } from "@/db";
import { contents, sendLogs, subscribers, type Content } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { sendMail } from "./mailer";
import { getQuotaStatus, sentEmailsForContent } from "./quota";
import { getSettings } from "./settings";
import { splitEmails } from "./sheet";
import { renderEmail } from "./template";

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
  /** 하루 한도로 다음 날로 넘어간 인원 */
  deferred?: number;
  error?: string | null;
  reason?: string;
}

/**
 * 콘텐츠를 수신자에게 발송한다. 하루 발송 한도(settings.daily_limit)를 지키며,
 * 수신자가 남은 한도보다 많으면 오늘 보낼 수 있는 만큼만 보내고 콘텐츠를
 * `partial`(부분 발송) 상태로 남겨 다음 날 스케줄러가 이어서 보낸다.
 *
 * - `partial` 상태 콘텐츠는 이미 받은 사람을 제외하고 이어서 보낸다 (중복 발송 없음).
 * - 그 외 상태에서의 발송(수동 재발송 포함)은 수신자 전원에게 새로 보낸다.
 * - `force`는 pending이 아닌 콘텐츠(발송 완료/실패/부분 발송)의 수동 발송을 허용한다.
 */
export async function sendContent(contentId: number, force = false): Promise<SendResult> {
  const allowed = force ? ["pending", "failed", "sent", "partial"] : ["pending", "partial"];
  const [before] = await db
    .select({ status: contents.status, sentCount: contents.sentCount })
    .from(contents)
    .where(eq(contents.id, contentId));
  const claimed = await db
    .update(contents)
    .set({ status: "sending", updatedAt: new Date(), error: null })
    .where(and(eq(contents.id, contentId), inArray(contents.status, allowed)))
    .returning();
  const c = claimed[0];
  if (!c) return { ok: false, reason: "이미 발송 중이거나 발송할 수 없는 콘텐츠입니다." };
  const resume = before?.status === "partial";

  const s = await getSettings();
  const recipients = await resolveRecipients(c);
  if (!recipients.length) {
    await db
      .update(contents)
      .set({ status: "failed", error: "수신자가 없습니다. 구독자를 추가하거나 '수신자' 열을 확인하세요.", updatedAt: new Date() })
      .where(eq(contents.id, c.id));
    return { ok: false, total: 0, error: "수신자가 없습니다. 구독자를 추가하거나 '수신자' 열을 확인하세요." };
  }

  // 이어 보내기(부분 발송 재개)일 때는 이미 받은 사람을 제외한다.
  let targets = recipients;
  if (resume) {
    const done = await sentEmailsForContent(contentId);
    targets = recipients.filter((r) => !done.has(r.email));
    if (!targets.length) {
      await db
        .update(contents)
        .set({ status: "sent", error: null, updatedAt: new Date(), sentAt: new Date() })
        .where(eq(contents.id, c.id));
      return { ok: true, sent: 0, total: recipients.length, deferred: 0 };
    }
  }

  // 하루 한도 — 남은 만큼만 오늘 보내고 나머지는 다음 날로 넘긴다.
  const quota = await getQuotaStatus(s);
  const deferred = quota.limit > 0 && targets.length > quota.remaining ? targets.length - quota.remaining : 0;
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
      deferred: targets.length,
      reason: `오늘 발송 한도(${quota.limit}통)를 모두 사용했습니다. 남은 ${targets.length}명은 내일 이어서 발송됩니다.`,
    };
  }

  let sent = 0;
  let failed = 0;
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
      lastError = e instanceof Error ? e.message : String(e);
      await db.insert(sendLogs).values({
        contentId: c.id,
        subject: mail.subject,
        email: r.email,
        status: "failed",
        error: lastError,
      });
    }
  }

  // 부분 발송 이어 보내기면 이전 배치까지 누적해서 표시한다.
  const baseSent = resume && before ? before.sentCount : 0;
  const status = deferred > 0 ? "partial" : sent > 0 ? "sent" : "failed";
  const error =
    deferred > 0
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

  return { ok: sent > 0, sent, failed, total: recipients.length, deferred, error };
}

export async function sendTest(contentId: number, to: string) {
  const [c] = await db.select().from(contents).where(eq(contents.id, contentId));
  if (!c) throw new Error("콘텐츠를 찾을 수 없습니다.");
  const s = await getSettings();
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
    const msg = e instanceof Error ? e.message : String(e);
    await db.insert(sendLogs).values({ contentId: c.id, subject: mail.subject, email: to, status: "failed", error: msg });
    throw e;
  }
}
