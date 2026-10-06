/**
 * 하루 발송 한도(쿼터) + 부분 발송 이어 보내기 E2E 테스트.
 * 로컬 임베디드 PostgreSQL을 실제 스키마로 마이그레이션한 뒤 실행합니다.
 *
 * 실행(저장소 루트에서): DATABASE_URL=... npx tsx scripts/e2e-quota.mts
 */
import { db } from "../src/db";
import { contents, sendLogs, settings, subscribers } from "../src/db/schema";
import { sendContent } from "../src/lib/dispatch";
import { tick } from "../src/lib/scheduler";
import { getQuotaStatus } from "../src/lib/quota";
import { getSettings, updateSettings } from "../src/lib/settings";
import { eq, sql } from "drizzle-orm";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "✅ PASS" : "❌ FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
  if (!cond) failures++;
}

async function getContent(id: number) {
  const [c] = await db.select().from(contents).where(eq(contents.id, id));
  return c;
}

/** 모든 발송 기록/콘텐츠 시간을 25시간 뒤로 옮겨 '한국 시간 기준 다음 날'을 시뮬레이션 */
async function advanceDay() {
  await db.execute(sql`update send_logs set created_at = created_at - interval '25 hours'`);
  await db.execute(sql`update contents set updated_at = updated_at - interval '25 hours', sent_at = sent_at - interval '25 hours'`);
  await db.execute(sql`update settings set last_queue_sent_date = null`);
}

/** 지금 한국 시간보다 몇 분 앞선 시각을 "기본 발송 시간"으로 설정해 큐/이어보내기 시간 창에 들어간다 */
async function setDefaultTimeMinutesAgo(minAgo: number) {
  const kst = new Date(Date.now() + 9 * 3600 * 1000 - minAgo * 60 * 1000);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  await updateSettings({ defaultSendTime: `${hh}:${mm}` });
}

async function main() {
  console.log("── 준비 ──");
  await db.delete(sendLogs);
  await db.delete(contents);
  await db.delete(subscribers);

  const s = await getSettings();
  await updateSettings({
    enabled: true,
    dailyLimit: 500,
    sheetUrl: "", // 동기화 실패 → 스케줄러가 경고만 남기고 계속 진행하는지 확인
    subscribersSheetUrl: "",
  });
  await setDefaultTimeMinutesAgo(5);

  // 구독자 1200명
  const subs = Array.from({ length: 1200 }, (_, i) => ({
    email: `sub${i}@example.com`,
    name: "",
    token: `tok${i}`,
    source: "manual",
  }));
  for (let i = 0; i < subs.length; i += 300) {
    await db.insert(subscribers).values(subs.slice(i, i + 300));
  }

  const [a] = await db
    .insert(contents)
    .values({ key: "e2e-a", rowNumber: 2, subject: "전체 발송 콘텐츠", body: "본문", source: "sheet" })
    .returning();

  const q0 = await getQuotaStatus();
  check("초기 쿼터: 한도 500 / 사용 0", q0.limit === 500 && q0.used === 0 && q0.remaining === 500);

  console.log("── 1일차: 수동 전체 발송 (1200명, 한도 500) ──");
  const r1 = await sendContent(a.id, true);
  const c1 = await getContent(a.id);
  check("500명 발송", r1.sent === 500, JSON.stringify(r1));
  check("700명 다음 날로 이월", r1.deferred === 700);
  check("상태 = partial", c1.status === "partial", c1.status);
  check("sentCount = 500", c1.sentCount === 500);

  console.log("── 같은 날 이어 보내기 재시도: 한도 소진 → 중복 없음 ──");
  const r2 = await sendContent(a.id, true);
  const c2 = await getContent(a.id);
  check("한도 소진 시 0건 발송", r2.sent === 0 && r2.ok === false, JSON.stringify(r2));
  check("여전히 700명 대기", r2.deferred === 700);
  check("상태 = partial 유지", c2.status === "partial");
  const logsDay1 = await db.select().from(sendLogs);
  check("1일차 로그 500건 (중복 없음)", logsDay1.length === 500 && new Set(logsDay1.map((l) => l.email)).size === 500);

  console.log("── 2일차: 이어 보내기 ──");
  await advanceDay();
  const q2 = await getQuotaStatus();
  check("다음 날 쿼터 초기화 (500 남음)", q2.remaining === 500, `used=${q2.used}`);
  const r3 = await sendContent(a.id, true);
  const c3 = await getContent(a.id);
  check("2일차 500명 발송", r3.sent === 500, JSON.stringify(r3));
  check("200명 다시 이월", r3.deferred === 200);
  check("상태 = partial 유지", c3.status === "partial");
  check("누적 sentCount = 1000", c3.sentCount === 1000, String(c3.sentCount));

  console.log("── 3일차: 나머지 200명 → 발송 완료 ──");
  await advanceDay();
  const r4 = await sendContent(a.id, true);
  const c4 = await getContent(a.id);
  check("3일차 200명 발송", r4.sent === 200, JSON.stringify(r4));
  check("상태 = sent", c4.status === "sent", c4.status);
  check("누적 sentCount = 1200", c4.sentCount === 1200, String(c4.sentCount));
  const allSent = await db.select().from(sendLogs).where(eq(sendLogs.status, "sent"));
  check(
    "3일 동안 1200건, 중복 수신 없음",
    allSent.length === 1200 && new Set(allSent.map((l) => l.email)).size === 1200,
    `logs=${allSent.length}`,
  );

  console.log("── 스케줄러 tick: 예약 콘텐츠 + 부분 발송 이어 보내기 ──");
  await db.delete(sendLogs);
  // 어제 09:00 KST 예약이었다가 한도로 500명만 간 콘텐츠 B (부분 발송 상태)
  const yesterday = new Date(Date.now() - 25 * 3600 * 1000);
  const [b] = await db
    .insert(contents)
    .values({
      key: "e2e-b",
      rowNumber: 3,
      subject: "예약 콘텐츠",
      body: "본문",
      source: "sheet",
      status: "partial",
      sentCount: 500,
      scheduledAt: yesterday,
    })
    .returning();
  // 어제 보낸 로그 500개 (첫 500명) + 마지막 시도 시각도 어제로
  await db.insert(sendLogs).values(
    Array.from({ length: 500 }, (_, i) => ({
      contentId: b.id,
      subject: "예약 콘텐츠",
      email: `sub${i}@example.com`,
      status: "sent",
      provider: "test",
      createdAt: yesterday,
    })),
  );
  await db.update(contents).set({ updatedAt: yesterday }).where(eq(contents.id, b.id));
  // 큐에 대기 중인 콘텐츠 C — 부분 발송이 끝날 때까지 건드리면 안 됨
  const [cRow] = await db
    .insert(contents)
    .values({ key: "e2e-c", rowNumber: 4, subject: "대기열 콘텐츠", body: "본문", source: "sheet" })
    .returning();

  const log1 = await tick();
  const b1 = await getContent(b.id);
  const c1row = await getContent(cRow.id);
  check("tick 로그에 시트 동기화 실패 경고만 있고 진행", log1.some((l) => l.includes("시트 동기화 실패")), log1.join(" | "));
  check("tick이 부분 발송 콘텐츠 이어 보냄 (500명)", b1.sentCount === 1000 && b1.status === "partial", `sent=${b1.sentCount}`);
  check("부분 발송 중에는 대기열 콘텐츠를 꺼내지 않음", c1row.status === "pending", c1row.status);
  check("tick 로그에 이어 보내기 기록", log1.some((l) => l.startsWith("[이어 보내기]")), log1.join(" | "));

  await advanceDay();
  await tick();
  const b2 = await getContent(b.id);
  check("다음 tick에서 나머지 200명 완료 → sent", b2.status === "sent" && b2.sentCount === 1200, `status=${b2.status} sent=${b2.sentCount}`);

  const bSent = await db.select().from(sendLogs).where(eq(sendLogs.contentId, b.id));
  check("콘텐츠 B 중복 수신 없음", bSent.length === 1200 && new Set(bSent.map((l) => l.email)).size === 1200);

  console.log("── 쿼터 무제한(0) 확인 ──");
  await db.delete(sendLogs);
  await updateSettings({ dailyLimit: 0 });
  const [d] = await db
    .insert(contents)
    .values({ key: "e2e-d", rowNumber: 5, subject: "무제한 콘텐츠", body: "본문", source: "sheet" })
    .returning();
  const r5 = await sendContent(d.id, true);
  const d1 = await getContent(d.id);
  check("한도 0이면 1200명 한 번에 발송", r5.sent === 1200 && r5.deferred === 0 && d1.status === "sent", JSON.stringify(r5));

  console.log(failures === 0 ? "\n🎉 ALL TESTS PASSED" : `\n💥 ${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
