import { randomBytes } from "crypto";
import { db } from "@/db";
import { contents, subscribers } from "@/db/schema";
import { and, notInArray, sql } from "drizzle-orm";
import { fetchSheetRows, rowsToContents, rowsToSubscribers } from "./sheet";
import { getSettings, updateSettings } from "./settings";

export function newToken() {
  return randomBytes(16).toString("hex");
}

// 한 행씩 upsert하면 원격 Supabase 왕복이 구독자 수만큼 발생해 Vercel 함수가
// 중간에 종료될 수 있다. 쿼리 크기도 제한하면서 수천 명을 빠르게 처리한다.
const SUBSCRIBER_BATCH_SIZE = 250;

async function upsertSubscribers(items: ReturnType<typeof rowsToSubscribers>) {
  for (let offset = 0; offset < items.length; offset += SUBSCRIBER_BATCH_SIZE) {
    const batch = items.slice(offset, offset + SUBSCRIBER_BATCH_SIZE);
    await db
      .insert(subscribers)
      .values(batch.map((subscriber) => ({ ...subscriber, source: "sheet", token: newToken() })))
      .onConflictDoUpdate({
        target: subscribers.email,
        // 기존 수신거부(active=false)와 직접 입력 출처는 그대로 유지한다.
        set: { name: sql`case when excluded.name <> '' then excluded.name else ${subscribers.name} end` },
      });
  }
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
      await upsertSubscribers(subs);
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
