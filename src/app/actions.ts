"use server";

import { db } from "@/db";
import { contents, subscribers } from "@/db/schema";
import { sendContent, sendTest } from "@/lib/dispatch";
import { tick } from "@/lib/scheduler";
import { getSettings, updateSettings } from "@/lib/settings";
import { isEmail, parseSheetUrl } from "@/lib/sheet";
import { newToken, syncSheet } from "@/lib/sync";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function back(path: string, msg: string, isError = false): never {
  revalidatePath("/", "layout");
  redirect(`${path}?${isError ? "err" : "msg"}=${encodeURIComponent(msg)}`);
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export async function syncAction(formData?: FormData) {
  const returnTo = formData ? String(formData.get("returnTo") || "") : "";
  const path = returnTo === "/" ? "/" : "/subscribers";
  let msg: string;
  try {
    const r = await syncSheet();
    msg = `시트 동기화 완료: 콘텐츠 ${r.count}건${r.subscribers ? `, 구독자 ${r.subscribers}명` : ""}${
      r.warnings.length ? ` · 주의: ${r.warnings.join(" / ")}` : ""
    }`;
  } catch (e) {
    back(path, errMsg(e), true);
  }
  back(path, msg);
}

export async function toggleEnabledAction() {
  const s = await getSettings();
  await updateSettings({ enabled: !s.enabled });
  back("/", !s.enabled ? "자동 발송을 켰습니다. 매 분마다 시트를 확인합니다." : "자동 발송을 껐습니다.");
}

export async function sendNowAction(formData: FormData) {
  const id = Number(formData.get("id"));
  let r: Awaited<ReturnType<typeof sendContent>>;
  try {
    r = await sendContent(id, true);
  } catch (e) {
    back("/", errMsg(e), true);
  }
  if (!r.ok) back("/", r.error ?? r.reason ?? "발송 실패", r.deferred ? false : true);
  if (r.sent === 0 && (r.alreadySent ?? 0) > 0 && !r.failed && !r.deferred) {
    back("/", `이미 성공한 ${r.alreadySent}명은 중복 발송 방지를 위해 건너뛰었습니다.`);
  }
  const notes = [
    r.alreadySent ? `이미 성공한 ${r.alreadySent}명은 건너뜀` : "",
    r.failed && !r.providerBlocked ? `실패 ${r.failed}명` : "",
    r.providerBlocked
      ? `Gmail 일일 한도 초과 — 미발송 ${r.deferred ?? 0}명은 24시간 후 이어서 발송됩니다`
      : r.deferred
        ? `남은 ${r.deferred}명은 내일 이어서 발송됩니다`
        : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const title = r.providerBlocked ? "Gmail 한도로 부분 발송" : "발송 완료";
  back("/", `${title}: ${r.sent}/${r.total}명${notes ? ` (${notes})` : ""}`);
}

export async function testSendAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const s = await getSettings();
  const to = String(formData.get("to") || s.testEmail).trim();
  if (!isEmail(to))
    back("/", "테스트 이메일 형식이 올바르지 않습니다. 주소 끝에 마침표(.)가 붙지 않았는지 확인해주세요.", true);
  let provider: string;
  try {
    provider = await sendTest(id, to);
  } catch (e) {
    back("/", `테스트 발송 실패: ${errMsg(e)}`, true);
  }
  back("/", provider === "test" ? `테스트 모드: ${to}로 발송한 것으로 기록했습니다 (메일 서버 미설정)` : `${to}로 테스트 메일을 보냈습니다.`);
}

export async function resetStatusAction(formData: FormData) {
  const id = Number(formData.get("id"));
  await db
    .update(contents)
    .set({ status: "pending", error: null, sentCount: 0, failCount: 0, sentAt: null })
    .where(eq(contents.id, id));
  back("/", "대기 상태로 되돌렸습니다.");
}

export async function tickAction() {
  const log = await tick();
  back("/", `스케줄러 실행: ${log.join(" / ") || "처리할 항목 없음"}`);
}

export async function saveSettingsAction(formData: FormData) {
  const sheetUrl = String(formData.get("sheetUrl") || "").trim();
  const subscribersSheetUrl = String(formData.get("subscribersSheetUrl") || "").trim();
  const defaultSendTime = String(formData.get("defaultSendTime") || "09:00");
  const sendDays = formData.getAll("sendDays").map(String).join(",");
  const fromName = String(formData.get("fromName") || "").trim() || "뉴스레터";
  const testEmail = String(formData.get("testEmail") || "").trim();
  const baseUrl = String(formData.get("baseUrl") || "").trim().replace(/\/$/, "");
  const dailyLimit = Number(formData.get("dailyLimit") ?? 500);

  if (sheetUrl && !parseSheetUrl(sheetUrl)) back("/settings", "콘텐츠 시트 URL이 올바르지 않습니다.", true);
  if (subscribersSheetUrl && !parseSheetUrl(subscribersSheetUrl))
    back("/settings", "구독자 시트 URL이 올바르지 않습니다.", true);
  if (!/^\d{2}:\d{2}$/.test(defaultSendTime)) back("/settings", "발송 시간 형식이 올바르지 않습니다.", true);
  if (testEmail && !isEmail(testEmail))
    back("/settings", "테스트 이메일 형식이 올바르지 않습니다. 주소 끝에 마침표(.)가 붙지 않았는지 확인해주세요.", true);
  if (!Number.isFinite(dailyLimit) || dailyLimit < 0 || dailyLimit > 100000)
    back("/settings", "앱 하루 발송 한도는 0 이상 100000 이하의 숫자로 입력하세요. (0 = 앱 한도 없음)", true);

  await updateSettings({
    sheetUrl,
    subscribersSheetUrl,
    defaultSendTime,
    sendDays,
    fromName,
    testEmail,
    baseUrl,
    dailyLimit: Math.round(dailyLimit),
  });
  back("/settings", "설정을 저장했습니다.");
}

export async function addSubscribersAction(formData: FormData) {
  const raw = String(formData.get("bulk") || "");
  const lines = raw.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  let added = 0;
  let invalid = 0;
  for (const line of lines) {
    // "홍길동 <a@b.com>", "a@b.com, 홍길동", "a@b.com"
    const email = line.match(/[^\s@,<>;]+@[^\s@,<>;]+\.[^\s@,<>;]+/)?.[0]?.toLowerCase();
    if (!email || !isEmail(email)) {
      invalid++;
      continue;
    }
    const name = line.replace(email, "").replace(/[<>,\t]/g, " ").trim();
    const r = await db
      .insert(subscribers)
      .values({ email, name, token: newToken() })
      .onConflictDoUpdate({ target: subscribers.email, set: { active: true, ...(name ? { name } : {}) } })
      .returning();
    if (r.length) added++;
  }
  back(
    "/subscribers",
    `${added}명 추가/갱신${invalid ? `, 형식 오류 ${invalid}줄 (주소 끝에 마침표(.)가 붙지 않았는지 확인)` : ""}`,
  );
}

export async function toggleSubscriberAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const [s] = await db.select().from(subscribers).where(eq(subscribers.id, id));
  if (s) await db.update(subscribers).set({ active: !s.active }).where(eq(subscribers.id, id));
  back("/subscribers", s?.active ? "수신을 중지했습니다." : "수신을 재개했습니다.");
}

export async function deleteSubscriberAction(formData: FormData) {
  const id = Number(formData.get("id"));
  await db.delete(subscribers).where(eq(subscribers.id, id));
  back("/subscribers", "삭제했습니다.");
}
