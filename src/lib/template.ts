function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function personalize(s: string, name: string, email: string) {
  const display = name || email.split("@")[0];
  return s
    .replace(/\{\{\s*(이름|name)\s*\}\}/gi, display)
    .replace(/\{\{\s*(이메일|email)\s*\}\}/gi, email);
}

function bodyToHtml(body: string) {
  if (/<(p|br|div|h\d|ul|ol|table|a|strong|b|img)\b/i.test(body)) return body;
  return esc(body)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#4f46e5">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function renderEmail(opts: {
  subject: string;
  body: string;
  link?: string;
  imageUrl?: string;
  fromName: string;
  name?: string;
  email?: string;
  unsubscribeUrl?: string;
}) {
  const name = opts.name ?? "";
  const email = opts.email ?? "subscriber@example.com";
  const subject = personalize(opts.subject, name, email);
  const body = personalize(opts.body, name, email);

  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">
<tr><td style="padding:20px 32px;background:#4f46e5;color:#ffffff;font-weight:700;font-size:15px">${esc(opts.fromName)}</td></tr>
${
  opts.imageUrl
    ? `<tr><td><img src="${esc(opts.imageUrl)}" alt="" width="600" style="display:block;width:100%;height:auto;border:0"/></td></tr>`
    : ""
}
<tr><td style="padding:32px 32px 8px"><h1 style="margin:0 0 20px;font-size:24px;line-height:1.35">${esc(subject)}</h1>
<div style="font-size:16px;line-height:1.75;color:#334155">${bodyToHtml(body)}</div></td></tr>
${
  opts.link
    ? `<tr><td style="padding:8px 32px 32px"><a href="${esc(opts.link)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px">자세히 보기 →</a></td></tr>`
    : `<tr><td style="padding:0 0 24px"></td></tr>`
}
</table>
<p style="font-size:12px;color:#94a3b8;margin:20px 0 0;line-height:1.6">본 메일은 ${esc(opts.fromName)} 구독자에게 발송되었습니다.${
    opts.unsubscribeUrl
      ? `<br/><a href="${esc(opts.unsubscribeUrl)}" style="color:#94a3b8">수신거부</a>`
      : ""
  }</p>
</td></tr></table></body></html>`;

  const text = [
    subject,
    "",
    body.replace(/<[^>]+>/g, ""),
    opts.link ? `\n자세히 보기: ${opts.link}` : "",
    opts.unsubscribeUrl ? `\n수신거부: ${opts.unsubscribeUrl}` : "",
  ].join("\n");

  return { subject, html, text };
}
