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

export async function syncAction() {
  let msg: string;
  try {
    const r = await syncSheet();
    msg = `시트 동기화 완료: 콘텐츠 ${r.count}건${r.subscribers ? `, 구독자 ${r.subscribers}명` : ""}${
      r.warnings.length ? ` · 주의: ${r.warnings.join(" / ")}` : ""
    }`;
  } catch (e) {
    back("/", errMsg(e), true);
  }
  back("/", msg);
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
  if (!r.ok) back("/", r.error ?? r.reason ?? "발송 실패", true);
  back("/", `발송 완료: ${r.sent}/${r.total}명${r.failed ? ` (실패 ${r.failed})` : ""}`);
}

export async function testSendAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const s = await getSettings();
  const to = String(formData.get("to") || s.testEmail).trim();
  if (!isEmail(to)) back("/", "설정에서 테스트 수신 이메일을 먼저 입력해주세요.", true);
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

  if (sheetUrl && !parseSheetUrl(sheetUrl)) back("/settings", "콘텐츠 시트 URL이 올바르지 않습니다.", true);
  if (subscribersSheetUrl && !parseSheetUrl(subscribersSheetUrl))
    back("/settings", "구독자 시트 URL이 올바르지 않습니다.", true);
  if (!/^\d{2}:\d{2}$/.test(defaultSendTime)) back("/settings", "발송 시간 형식이 올바르지 않습니다.", true);
  if (testEmail && !isEmail(testEmail)) back("/settings", "테스트 이메일 형식이 올바르지 않습니다.", true);

  await updateSettings({ sheetUrl, subscribersSheetUrl, defaultSendTime, sendDays, fromName, testEmail, baseUrl });
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
  back("/subscribers", `${added}명 추가/갱신${invalid ? `, 형식 오류 ${invalid}줄` : ""}`);
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
