import nodemailer, { type Transporter } from "nodemailer";

export type MailProvider = "resend" | "smtp" | "test";

export function getProvider(): MailProvider {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST || (process.env.SMTP_USER && process.env.SMTP_PASS)) return "smtp";
  return "test";
}

export function providerLabel(p: MailProvider = getProvider()) {
  if (p === "resend") return "Resend API";
  if (p === "smtp") return `SMTP (${process.env.SMTP_HOST || "smtp.gmail.com"})`;
  return "테스트 모드 (실제 발송 안 함)";
}

function fromAddress(fromName: string) {
  const addr =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    (getProvider() === "resend" ? "onboarding@resend.dev" : "no-reply@example.com");
  if (addr.includes("<")) return addr;
  return fromName ? `"${fromName.replace(/"/g, "")}" <${addr}>` : addr;
}

const g = globalThis as typeof globalThis & { __smtpTransport?: Transporter };

function smtp(): Transporter {
  if (!g.__smtpTransport) {
    const port = Number(process.env.SMTP_PORT || 465);
    g.__smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      pool: true,
      maxConnections: 3,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return g.__smtpTransport;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName: string;
  unsubscribeUrl?: string;
}): Promise<{ provider: MailProvider }> {
  const provider = getProvider();
  const from = fromAddress(opts.fromName);
  const headers: Record<string, string> = {};
  if (opts.unsubscribeUrl) headers["List-Unsubscribe"] = `<${opts.unsubscribeUrl}>`;

  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        headers,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
    }
  } else if (provider === "smtp") {
    await smtp().sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      headers,
    });
  } else {
    console.log(`[mail:test] to=${opts.to} subject=${opts.subject}`);
  }
  return { provider };
}
