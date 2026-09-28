import { db } from "@/db";
import { contents } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { renderEmail } from "@/lib/template";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [c] = await db.select().from(contents).where(eq(contents.id, Number(id)));
  if (!c) return new Response("Not found", { status: 404 });
  const s = await getSettings();
  const { html } = renderEmail({
    subject: c.subject,
    body: c.body,
    link: c.link,
    imageUrl: c.imageUrl,
    fromName: s.fromName,
    name: "홍길동",
    email: "hong@example.com",
    unsubscribeUrl: s.baseUrl ? `${s.baseUrl}/unsubscribe?token=preview` : undefined,
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
