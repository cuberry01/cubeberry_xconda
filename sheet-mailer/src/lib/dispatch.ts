import { db } from "@/db";
import { contents, sendLogs, subscribers, type Content } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { sendMail } from "./mailer";
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
  const all = await db.select().from(subscribers).where(eq(subscribers.active, true));
  return all.map((s) => ({ email: s.email, name: s.name, token: s.token as string | undefined }));
}

/**
 * Atomically claims content and sends it to all recipients.
 * `force` allows re-sending failed/sent content (manual trigger).
 */
export async function sendContent(contentId: number, force = false) {
  const allowed = force ? ["pending", "failed", "sent"] : ["pending"];
  const claimed = await db
    .update(contents)
    .set({ status: "sending", updatedAt: new Date(), error: null })
    .where(and(eq(contents.id, contentId), inArray(contents.status, allowed)))
    .returning();
  const c = claimed[0];
  if (!c) return { ok: false, reason: "이미 발송 중이거나 발송된 콘텐츠입니다." };

  const s = await getSettings();
  const recipients = await resolveRecipients(c);
  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const r of recipients) {
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

  const status = sent > 0 ? "sent" : "failed";
  const error =
    recipients.length === 0
      ? "수신자가 없습니다. 구독자를 추가하거나 '수신자' 열을 확인하세요."
      : failed > 0
        ? `${failed}건 실패: ${lastError}`
        : null;
  await db
    .update(contents)
    .set({
      status,
      sentAt: sent > 0 ? new Date() : c.sentAt,
      sentCount: sent,
      failCount: failed,
      error,
      updatedAt: new Date(),
    })
    .where(eq(contents.id, c.id));

  return { ok: sent > 0, sent, failed, total: recipients.length, error };
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
