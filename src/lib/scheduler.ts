import { db } from "@/db";
import { contents, settings, type Content, type Settings } from "@/db/schema";
import { and, asc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { sendContent } from "./dispatch";
import { runXcondaTick } from "./xconda/pipeline";
import { getQuotaStatus } from "./quota";
import { getSettings, updateSettings } from "./settings";
import { syncSheet } from "./sync";
import { formatKst, fromKst, kstDateKey, kstParts } from "./time";

// Scheduled items are sent if they became due within this window (server downtime tolerance).
export const GRACE_MS = 6 * 60 * 60 * 1000;
// Queue (no date) items are sent only within this window after the default send time.
const QUEUE_WINDOW_MIN = 60;

export function parseSendDays(s: string) {
  return s
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => d >= 0 && d <= 6);
}

export function nextQueueSlot(s: Settings, from = new Date()): Date | null {
  const days = parseSendDays(s.sendDays);
  if (!days.length) return null;
  const [h, m] = s.defaultSendTime.split(":").map(Number);
  const today = kstDateKey(from);
  for (let i = 0; i < 8; i++) {
    const p = kstParts(new Date(from.getTime() + i * 86400000));
    const slot = fromKst(p.year, p.month, p.day, h || 0, m || 0);
    if (!days.includes(p.weekday)) continue;
    if (i === 0 && (slot < from || s.lastQueueSentDate === today)) continue;
    return slot;
  }
  return null;
}

/** Compute the expected send time for each content (for UI). */
export function plannedTimes(list: Content[], s: Settings) {
  const result = new Map<number, Date | null>();
  const queue = list
    .filter((c) => c.status === "pending" && c.active && (c.inSheet || c.source === "xconda") && !c.scheduledAt)
    .sort((a, b) => a.rowNumber - b.rowNumber);
  let cursor = new Date();
  for (const c of queue) {
    const slot = nextQueueSlot({ ...s, lastQueueSentDate: result.size ? kstDateKey(cursor) : s.lastQueueSentDate }, cursor);
    result.set(c.id, slot);
    if (!slot) break;
    cursor = new Date(slot.getTime() + 60000);
  }
  return result;
}

let running = false;

export async function tick(): Promise<string[]> {
  if (running) return ["이전 작업이 진행 중입니다."];
  running = true;
  const log: string[] = [];
  try {
    const now = new Date();
    await updateSettings({ lastTickAt: now });
    const s = await getSettings();

    // Recover stuck "sending" rows (crash during send)
    await db
      .update(contents)
      .set({ status: "failed", error: "발송 중 중단됨 (서버 재시작 등)" })
      .where(and(eq(contents.status, "sending"), lt(contents.updatedAt, new Date(now.getTime() - 60 * 60 * 1000))));

    if (!s.enabled) return ["자동 발송이 꺼져 있습니다."];

    try {
      const r = await syncSheet();
      log.push(`시트 동기화: ${r.count}건`);
    } catch (e) {
      log.push(`시트 동기화 실패: ${e instanceof Error ? e.message : e}`);
    }

    const sendable = or(eq(contents.inSheet, true), eq(contents.source, "xconda"));
    const p = kstParts(now);
    const days = parseSendDays(s.sendDays);
    const [h, m] = s.defaultSendTime.split(":").map(Number);
    const minutesNow = p.hour * 60 + p.minute;
    const minutesSlot = (h || 0) * 60 + (m || 0);
    const today = kstDateKey(now);

    const quotaExhausted = async () => {
      const q = await getQuotaStatus(s, now);
      return q.providerBlocked || (!q.unlimited && q.remaining <= 0);
    };

    // 0) 부분 발송 이어 보내기 — 하루 한도로 일부만 보낸 콘텐츠를 다음 날 기본 발송 시각부터 재개한다.
    if (days.includes(p.weekday) && minutesNow >= minutesSlot && !(await quotaExhausted())) {
      const partials = await db
        .select()
        .from(contents)
        .where(and(eq(contents.status, "partial"), eq(contents.active, true), sendable))
        .orderBy(asc(contents.id));
      for (const c of partials) {
        const lastAttempt = c.updatedAt ?? c.sentAt ?? c.createdAt;
        if (kstDateKey(lastAttempt) === today) continue; // 오늘은 이미 시도했다
        if (c.scheduledAt && c.scheduledAt.getTime() > now.getTime()) continue; // 예약 시각 전에는 재개하지 않는다
        const r = await sendContent(c.id);
        log.push(`[이어 보내기] "${c.subject}" → ${JSON.stringify(r)}`);
        if (await quotaExhausted()) break;
      }
    }

    // 1) Items with explicit send date/time
    const due = await db
      .select()
      .from(contents)
      .where(
        and(
          eq(contents.status, "pending"),
          eq(contents.active, true),
          sendable,
          lte(contents.scheduledAt, now),
          gte(contents.scheduledAt, new Date(now.getTime() - GRACE_MS)),
        ),
      )
      .orderBy(asc(contents.scheduledAt));
    for (const c of due) {
      // 한도가 소진됐으면 보내는 대신 부분 발송으로 전환해 다음 날 이어 보낸다 (기한 만료로 유실 방지).
      const r = await sendContent(c.id);
      log.push(`[예약] "${c.subject}" → ${JSON.stringify(r)}`);
      if (await quotaExhausted()) break;
    }

    // 2) Queue items (no date) — one per send day at the default time.
    //    부분 발송 중인 콘텐츠가 남아 있으면 새 콘텐츠를 꺼내지 않고 이어 보내기에 집중한다.
    const [partialLeft] = await db
      .select({ id: contents.id })
      .from(contents)
      .where(eq(contents.status, "partial"))
      .limit(1);
    if (
      !partialLeft &&
      days.includes(p.weekday) &&
      minutesNow >= minutesSlot &&
      minutesNow < minutesSlot + QUEUE_WINDOW_MIN &&
      s.lastQueueSentDate !== today
    ) {
      const [next] = await db
        .select()
        .from(contents)
        .where(
          and(
            eq(contents.status, "pending"),
            eq(contents.active, true),
            or(eq(contents.inSheet, true), eq(contents.source, "xconda")),
            isNull(contents.scheduledAt),
          ),
        )
        .orderBy(asc(contents.rowNumber))
        .limit(1);
      if (next) {
        // claim today's slot atomically so only one process sends
        const claimed = await db
          .update(settings)
          .set({ lastQueueSentDate: today })
          .where(
            and(
              eq(settings.id, 1),
              or(isNull(settings.lastQueueSentDate), sql`${settings.lastQueueSentDate} <> ${today}`),
            ),
          )
          .returning();
        if (claimed.length) {
          const r = await sendContent(next.id);
          log.push(`[대기열 ${formatKst(now)}] "${next.subject}" → ${JSON.stringify(r)}`);
        }
      }
    }
    return log;
  } catch (e) {
    console.error("[scheduler] tick error", e);
    return [...log, `오류: ${e instanceof Error ? e.message : e}`];
  } finally {
    running = false;
  }
}

const g = globalThis as typeof globalThis & { __mailScheduler?: NodeJS.Timeout };

export function startScheduler() {
  if (g.__mailScheduler || process.env.DISABLE_SCHEDULER === "true") return;
  console.log("[scheduler] started (every 60s)");
  const run = async () => {
    const logs: string[] = [];
    try {
      logs.push(...(await tick()));
    } catch (e) {
      console.error("[scheduler]", e);
    }
    try {
      logs.push(...(await runXcondaTick()));
    } catch (e) {
      console.error("[xconda]", e);
    }
    if (logs.length && logs.some((x) => x.startsWith("["))) console.log("[scheduler]", logs.join(" | "));
  };
  setTimeout(run, 10_000);
  g.__mailScheduler = setInterval(run, 60_000);
}
