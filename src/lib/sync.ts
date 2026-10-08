import { randomBytes } from "crypto";
import { db } from "@/db";
import { contents, subscribers } from "@/db/schema";
import { and, notInArray, sql } from "drizzle-orm";
import { checkImageAccessible, resolveImageUrl } from "./drive";
import { fetchSheetRows, rowsToContents, rowsToSubscribers } from "./sheet";
import { getSettings, updateSettings } from "./settings";

// 드라이브 이미지 접근 확인은 시트 동기화를 느리게 하지 않도록 건수를 제한한다.
const MAX_IMAGE_CHECKS = 20;

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

    // 구글 드라이브 공유 링크는 메일에 바로 심을 수 없어 직접 이미지 주소로 변환한다.
    // 변환된 주소가 실제로 읽히는지 확인해 공유 설정 문제를 경고로 알려준다.
    let checked = 0;
    for (const it of items) {
      if (!it.imageUrl) continue;
      const resolved = resolveImageUrl(it.imageUrl);
      if (resolved.url !== it.imageUrl) it.imageUrl = resolved.url;
      if (resolved.driveFileId && checked < MAX_IMAGE_CHECKS) {
        checked++;
        const access = await checkImageAccessible(resolved.url);
        if (!access.ok) {
          warnings.push(
            `${it.rowNumber}행: 이미지를 읽을 수 없습니다 (${access.reason}). 드라이브 파일 공유 설정이 '링크가 있는 모든 사용자 – 뷰어'인지 확인하세요.`,
          );
        }
      }
    }

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
      const subs = rowsToSubscribers(subRows, warnings);
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
