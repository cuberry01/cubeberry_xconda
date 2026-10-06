import { db, pool } from "@/db";
import { settings, type Settings } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_SHEET =
  "https://docs.google.com/spreadsheets/d/1CavwYt1DHE91E1m41gf1TzCDd48HroP0D8YXTgOlsjM/edit?usp=sharing";

/* ── 마이그레이션 지연 자동 복구 ───────────────────────────────────────────────
   새 코드가 읽는 컬럼이 운영 DB에 아직 없으면(예: daily_limit) 그 페이지 하나가
   아니라 settings를 읽는 **모든 화면**이 서버 렌더링 중 예외로 죽습니다.
   프로덕션 빌드는 원문 메시지를 가리고 "Server Components render" + React #419
   (서스펜스 경계 미완료)만 남겨서 원인 파악이 어렵습니다.
   그래서 settings를 읽기 전에 아래 DDL을 멱등하게 실행하고 다시 읽습니다. */
const UNDEFINED_COLUMN = "42703";

const AUTO_REPAIR_DDL = [
  // 20261006000000_mail_quota.sql — 하루 발송 한도 (0 = 무제한)
  "alter table public.settings add column if not exists daily_limit integer not null default 500",
];

/** 프로세스당 한 번만 복구를 시도합니다. (권한이 없어 실패할 때 요청마다 DDL을 반복하지 않도록) */
let repairAttempted = false;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** pg 오류 코드를 찾습니다. Drizzle은 pg 오류를 cause로 감싸서 던집니다. */
function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

async function selectSettings(): Promise<Settings | undefined> {
  const rows = await db.select().from(settings).where(eq(settings.id, 1));
  return rows[0];
}

/** 누락된 컬럼을 멱등하게 추가합니다. (테이블 자체가 없으면 여기서 원래 오류가 납니다) */
async function repairMissingColumns(): Promise<void> {
  for (const ddl of AUTO_REPAIR_DDL) {
    await pool.query(ddl);
  }
}

/**
 * 최후 수단: 복구 권한이 없어 DDL이 실패한 경우에도 화면은 살립니다.
 * daily_limit 하나만 기본값(마이그레이션과 같은 500)으로 채우고 나머지 컬럼을 읽습니다.
 * 이 상태에서는 설정 저장·발송이 정상 동작하지 않으므로 서버 로그에 경고를 남깁니다.
 */
async function selectSettingsWithoutDailyLimit(): Promise<Settings | undefined> {
  const rows = await db
    .select({
      id: settings.id,
      sheetUrl: settings.sheetUrl,
      subscribersSheetUrl: settings.subscribersSheetUrl,
      enabled: settings.enabled,
      defaultSendTime: settings.defaultSendTime,
      sendDays: settings.sendDays,
      fromName: settings.fromName,
      testEmail: settings.testEmail,
      baseUrl: settings.baseUrl,
      lastQueueSentDate: settings.lastQueueSentDate,
      lastSyncedAt: settings.lastSyncedAt,
      lastSyncError: settings.lastSyncError,
      lastTickAt: settings.lastTickAt,
      xEnabled: settings.xEnabled,
      xNotionDatabaseId: settings.xNotionDatabaseId,
      xRsshubBase: settings.xRsshubBase,
      xAutoPublish: settings.xAutoPublish,
      xEmailOnPublish: settings.xEmailOnPublish,
      xMaxAgeDays: settings.xMaxAgeDays,
      xLastTickAt: settings.xLastTickAt,
      xLastTickLog: settings.xLastTickLog,
    })
    .from(settings)
    .where(eq(settings.id, 1));
  const row = rows[0];
  return row ? { ...row, dailyLimit: 500 } : undefined;
}

/** 컬럼이 없어도 실패하지 않는 읽기 (구제 경로 포함) */
async function selectSettingsSafe(): Promise<Settings | undefined> {
  try {
    return await selectSettings();
  } catch (err) {
    if (pgErrorCode(err) !== UNDEFINED_COLUMN) throw err;
    return selectSettingsWithoutDailyLimit();
  }
}

export async function getSettings(): Promise<Settings> {
  let row: Settings | undefined;

  try {
    row = await selectSettings();
  } catch (err) {
    if (repairAttempted) {
      // 이미 복구를 시도했는데 컬럼이 또 없다 = DDL 권한 없음. 구제 경로로 화면만 살립니다.
      row = await selectSettingsSafe();
    } else {
      repairAttempted = true;
      try {
        await repairMissingColumns();
        row = await selectSettings();
        console.warn(
          "[xconda] settings 스키마가 마이그레이션보다 뒤처져 있어 자동 복구했습니다. " +
            "Supabase SQL Editor에서 supabase/migrations 의 SQL을 실행해 주세요.",
        );
      } catch {
        // DDL 권한이 없거나 테이블 자체가 없는 경우 — 그래도 화면은 띄웁니다.
        console.error(
          `[xconda] settings 스키마 자동 복구에 실패했습니다. Supabase SQL Editor에서 마이그레이션을 실행하세요. (${errorMessage(err)})`,
        );
        row = await selectSettingsSafe();
      }
    }
  }

  if (row) return row;

  await db
    .insert(settings)
    .values({ id: 1, sheetUrl: process.env.SHEET_URL || DEFAULT_SHEET })
    .onConflictDoNothing();
  const again = await selectSettingsSafe();
  if (!again) throw new Error("settings 기본 행을 만들지 못했습니다. DATABASE_URL과 테이블 권한을 확인하세요.");
  return again;
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>) {
  await getSettings();
  await db.update(settings).set(patch).where(eq(settings.id, 1));
}
