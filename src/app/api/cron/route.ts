import { tick } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

// Vercel: Hobby(무료) 플랜에서도 안전한 실행 시간 (Fluid 기본 300s / 미사용 시 상한 60s)
export const maxDuration = 60;

// External trigger (e.g. Vercel Cron / cron-job.org) — call every minute.
// If CRON_SECRET is set, pass ?secret=... or Authorization: Bearer ...
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const auth = req.headers.get("authorization");
    if (url.searchParams.get("secret") !== secret && auth !== `Bearer ${secret}`) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const log = await tick();
  return Response.json({ ok: true, log });
}

export const GET = handle;
export const POST = handle;
