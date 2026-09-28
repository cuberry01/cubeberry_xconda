import { randomBytes } from "crypto";
import { db } from "@/db";
import { contents, subscribers } from "@/db/schema";
import { and, notInArray, sql } from "drizzle-orm";
import { fetchSheetRows, rowsToContents, rowsToSubscribers } from "./sheet";
import { getSettings, updateSettings } from "./settings";

export function newToken() {
  return randomBytes(16).toString("hex");
}

export async function syncSheet(): Promise<{
  count: number;
  subscribers: number;
  warnings: string[];
}> {
  const s = await getSettings();
  try {
    if (!s.sheetUrl) throw new Error("설정에서 콘텐츠 스프레드시트 URL을 입력해주세요.");
    const rows = await fetchSheetRows(s.sheetUrl);
    const { items, warnings } = rowsToContents(rows, s.defaultSendTime);
    const now = new Date();

    for (const it of items) {
      await db
        .insert(contents)
        .values({ ...it, inSheet: true, updatedAt: now })
        .onConflictDoUpdate({
          target: contents.key,
          set: {
            rowNumber: it.rowNumber,
            subject: it.subject,
            body: it.body,
            link: it.link,
            imageUrl: it.imageUrl,
            recipients: it.recipients,
            rawSchedule: it.rawSchedule,
            scheduledAt: it.scheduledAt,
            active: it.active,
            inSheet: true,
          },
        });
    }
    const keys = items.map((i) => i.key);
    await db
      .update(contents)
      .set({ inSheet: false })
      .where(keys.length ? and(notInArray(contents.key, keys)) : sql`true`);

    let subCount = 0;
    if (s.subscribersSheetUrl) {
      const subRows = await fetchSheetRows(s.subscribersSheetUrl);
      const subs = rowsToSubscribers(subRows);
      for (const sub of subs) {
        await db
          .insert(subscribers)
          .values({ email: sub.email, name: sub.name, source: "sheet", token: newToken() })
          .onConflictDoUpdate({
            target: subscribers.email,
            set: { name: sql`case when excluded.name <> '' then excluded.name else ${subscribers.name} end` },
          });
      }
      subCount = subs.length;
    }

    await updateSettings({ lastSyncedAt: now, lastSyncError: null });
    return { count: items.length, subscribers: subCount, warnings };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateSettings({ lastSyncedAt: new Date(), lastSyncError: msg });
    throw e;
  }
}
