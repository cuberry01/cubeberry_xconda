import { db } from "@/db";
import { settings, type Settings } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_SHEET =
  "https://docs.google.com/spreadsheets/d/1CavwYt1DHE91E1m41gf1TzCDd48HroP0D8YXTgOlsjM/edit?usp=sharing";

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(settings).where(eq(settings.id, 1));
  if (rows[0]) return rows[0];
  await db
    .insert(settings)
    .values({ id: 1, sheetUrl: process.env.SHEET_URL || DEFAULT_SHEET })
    .onConflictDoNothing();
  const again = await db.select().from(settings).where(eq(settings.id, 1));
  return again[0];
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>) {
  await getSettings();
  await db.update(settings).set(patch).where(eq(settings.id, 1));
}
