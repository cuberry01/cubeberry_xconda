import { db } from "@/db";
import { contents, subscribers, type Content } from "@/db/schema";
import { Flash, type FlashParams } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { getProvider, providerLabel } from "@/lib/mailer";
import { GRACE_MS, nextQueueSlot, parseSendDays, plannedTimes } from "@/lib/scheduler";
import { getSettings, updateSettings } from "@/lib/settings";
import { splitEmails } from "@/lib/sheet";
import { formatKst } from "@/lib/time";
import { asc, count, eq } from "drizzle-orm";
import { headers } from "next/headers";
import {
  resetStatusAction,
  sendNowAction,
  syncAction,
  testSendAction,
  tickAction,
  toggleEnabledAction,
} from "./actions";

export const dynamic = "force-dynamic";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function statusBadge(c: Content, now: Date) {
  let label = "대기";
  let cls = "bg-slate-100 text-slate-700";
  if (c.status === "sent") [label, cls] = ["발송 완료", "bg-emerald-100 text-emerald-700"];
  else if (c.status === "failed") [label, cls] = ["실패", "bg-rose-100 text-rose-700"];
  else if (c.status === "sending") [label, cls] = ["발송 중", "bg-amber-100 text-amber-700"];
  else if (!c.active) [label, cls] = ["보류", "bg-slate-200 text-slate-500"];
  else if (c.scheduledAt && c.scheduledAt.getTime() < now.getTime() - GRACE_MS)
    [label, cls] = ["기한 지남", "bg-orange-100 text-orange-700"];
  else [label, cls] = ["예약됨", "bg-indigo-100 text-indigo-700"];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export default async function Home({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  let s = await getSettings();
  if (!s.baseUrl) {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host && !host.startsWith("localhost") && !host.startsWith("127.")) {
      const proto = h.get("x-forwarded-proto") || "https";
      await updateSettings({ baseUrl: `${proto}://${host}` });
      s = await getSettings();
    }
  }

  const list = await db
    .select()
    .from(contents)
    .where(eq(contents.inSheet, true))
    .orderBy(asc(contents.rowNumber));
  const [{ value: subCount }] = await db
    .select({ value: count() })
    .from(subscribers)
    .where(eq(subscribers.active, true));

  const now = new Date();
  const planned = plannedTimes(list, s);
  const upcoming = list
    .filter((c) => c.status === "pending" && c.active)
    .map((c) => ({ c, at: c.scheduledAt ?? planned.get(c.id) ?? null }))
    .filter((x) => x.at && x.at.getTime() >= now.getTime() - 60000)
    .sort((a, b) => a.at!.getTime() - b.at!.getTime())[0];
  const provider = getProvider();
  const days = parseSendDays(s.sendDays);
  const tickAlive = s.lastTickAt && now.getTime() - s.lastTickAt.getTime() < 3 * 60 * 1000;

  return (
    <div>
      <Flash msg={sp.msg} err={sp.err} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">자동 발송</div>
          <div className="mt-1 flex items-center justify-between">
            <div className={`text-xl font-bold ${s.enabled ? "text-emerald-600" : "text-slate-400"}`}>
              {s.enabled ? "● 켜짐" : "○ 꺼짐"}
            </div>
            <form action={toggleEnabledAction}>
              <SubmitButton variant={s.enabled ? "secondary" : "primary"}>{s.enabled ? "끄기" : "켜기"}</SubmitButton>
            </form>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            스케줄러 {tickAlive ? "정상 동작 중" : "대기"} · 마지막 확인 {formatKst(s.lastTickAt)}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">다음 발송</div>
          <div className="mt-1 text-lg font-bold">{upcoming?.at ? formatKst(upcoming.at) : "예정 없음"}</div>
          <div className="mt-2 truncate text-xs text-slate-500">{upcoming ? upcoming.c.subject : "시트에 콘텐츠를 추가하세요"}</div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">활성 구독자</div>
          <div className="mt-1 text-xl font-bold">{subCount.toLocaleString()}명</div>
          <a href="/subscribers" className="mt-2 inline-block text-xs text-indigo-600 hover:underline">
            구독자 관리 →
          </a>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">발송 방식</div>
          <div className={`mt-1 text-base font-bold ${provider === "test" ? "text-amber-600" : ""}`}>
            {providerLabel(provider)}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            기본 발송: {days.map((d) => DAY_LABELS[d]).join("·") || "없음"} {s.defaultSendTime} (KST)
          </div>
        </div>
      </div>

      {provider === "test" && (
        <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          메일 서버가 설정되지 않아 <b>테스트 모드</b>로 동작합니다. 발송 기록만 남고 실제 메일은 보내지 않습니다. 실제로 보내려면 환경변수에{" "}
          <code className="rounded bg-amber-100 px-1">SMTP_USER</code>, <code className="rounded bg-amber-100 px-1">SMTP_PASS</code>
          (Gmail 앱 비밀번호) 또는 <code className="rounded bg-amber-100 px-1">RESEND_API_KEY</code>를 추가하세요. 자세한 내용은{" "}
          <a href="/settings" className="underline">
            설정
          </a>
          을 참고하세요.
        </div>
      )}

      <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold">📄 콘텐츠 스프레드시트</h2>
            {s.sheetUrl ? (
              <a href={s.sheetUrl} target="_blank" rel="noreferrer" className="block truncate text-sm text-indigo-600 hover:underline">
                {s.sheetUrl}
              </a>
            ) : (
              <p className="text-sm text-rose-600">설정에서 시트 URL을 입력하세요.</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              마지막 동기화: {formatKst(s.lastSyncedAt)}
              {s.lastSyncError && <span className="ml-2 text-rose-600">· 오류: {s.lastSyncError}</span>}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <form action={syncAction}>
              <SubmitButton pendingText="불러오는 중…">🔄 시트 불러오기</SubmitButton>
            </form>
            <form action={tickAction}>
              <SubmitButton variant="secondary" pendingText="실행 중…">⏱ 스케줄러 지금 실행</SubmitButton>
            </form>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">콘텐츠 목록 ({list.length})</h2>
          <span className="text-xs text-slate-500">자동 발송이 켜져 있으면 매 분 시트를 다시 읽어 반영합니다</span>
        </div>
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            아직 불러온 콘텐츠가 없습니다. 시트에 아래 형식으로 작성한 뒤 <b>시트 불러오기</b>를 누르세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">행</th>
                  <th className="px-4 py-2 font-medium">발송 시각</th>
                  <th className="px-4 py-2 font-medium">제목 / 본문</th>
                  <th className="px-4 py-2 font-medium">수신자</th>
                  <th className="px-4 py-2 font-medium">상태</th>
                  <th className="px-4 py-2 text-right font-medium">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((c) => {
                  const plan = c.scheduledAt ?? planned.get(c.id) ?? null;
                  const rc = c.recipients ? splitEmails(c.recipients).length : null;
                  return (
                    <tr key={c.id} className="align-top">
                      <td className="px-4 py-3 text-slate-400">{c.rowNumber}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {c.status === "sent" ? (
                          <span className="text-slate-500">{formatKst(c.sentAt)}</span>
                        ) : (
                          <>
                            <div>{formatKst(plan)}</div>
                            <div className="text-xs text-slate-400">{c.scheduledAt ? "지정 일시" : "대기열 (기본 시간)"}</div>
                          </>
                        )}
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <div className="font-medium">{c.subject}</div>
                        <div className="line-clamp-2 text-xs text-slate-500">{c.body}</div>
                        {c.error && <div className="mt-1 text-xs text-rose-600">{c.error}</div>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {rc === null ? `전체 (${subCount})` : `지정 ${rc}명`}
                        {c.status === "sent" && <div className="text-xs text-emerald-600">{c.sentCount}명 발송</div>}
                      </td>
                      <td className="px-4 py-3">{statusBadge(c, now)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          <a
                            href={`/preview/${c.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                          >
                            미리보기
                          </a>
                          <form action={testSendAction}>
                            <input type="hidden" name="id" value={c.id} />
                            <SubmitButton variant="ghost" pendingText="…">
                              테스트
                            </SubmitButton>
                          </form>
                          {c.status !== "sending" && (
                            <form action={sendNowAction}>
                              <input type="hidden" name="id" value={c.id} />
                              <SubmitButton
                                variant="secondary"
                                confirm={`"${c.subject}"을(를) ${rc === null ? `전체 구독자 ${subCount}명` : `${rc}명`}에게 지금 발송할까요?`}
                                pendingText="발송 중…"
                              >
                                {c.status === "sent" ? "재발송" : "지금 발송"}
                              </SubmitButton>
                            </form>
                          )}
                          {(c.status === "sent" || c.status === "failed") && (
                            <form action={resetStatusAction}>
                              <input type="hidden" name="id" value={c.id} />
                              <SubmitButton variant="ghost">대기로</SubmitButton>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-semibold">📝 시트 작성 방법</h2>
        <p className="mb-3 text-sm text-slate-600">
          시트 <b>첫 행에 아래 머리글</b>을 입력하고 2행부터 콘텐츠를 한 줄씩 작성하세요. <b>제목</b>만 필수입니다. 시트 공유는{" "}
          <b>&quot;링크가 있는 모든 사용자 – 뷰어&quot;</b>로 설정해야 합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs ring-1 ring-slate-200">
            <thead className="bg-emerald-50 text-emerald-900">
              <tr>
                {["발송일시", "제목", "본문", "링크", "이미지", "수신자", "사용"].map((h) => (
                  <th key={h} className="border border-slate-200 px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-slate-700">
              <tr>
                <td className="border border-slate-200 px-3 py-2">2026-10-05 09:00</td>
                <td className="border border-slate-200 px-3 py-2">{"{{이름}}님, 10월 소식입니다"}</td>
                <td className="border border-slate-200 px-3 py-2">안녕하세요! 이번 달 업데이트를 전해드립니다…</td>
                <td className="border border-slate-200 px-3 py-2">https://example.com/news</td>
                <td className="border border-slate-200 px-3 py-2">https://…/banner.png</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-400">(비우면 전체)</td>
                <td className="border border-slate-200 px-3 py-2">Y</td>
              </tr>
              <tr>
                <td className="border border-slate-200 px-3 py-2 text-slate-400">(비우면 대기열)</td>
                <td className="border border-slate-200 px-3 py-2">주간 팁 #1</td>
                <td className="border border-slate-200 px-3 py-2">**굵게** 표시와 줄바꿈이 적용됩니다</td>
                <td className="border border-slate-200 px-3 py-2"></td>
                <td className="border border-slate-200 px-3 py-2"></td>
                <td className="border border-slate-200 px-3 py-2">a@x.com, b@y.com</td>
                <td className="border border-slate-200 px-3 py-2">보류</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-slate-600">
          <li>
            <b>발송일시</b>: 해당 시각(한국 시간)에 발송합니다. <code>2026-10-05 09:00</code>, <code>2026. 10. 5 오전 9:00:00</code> 모두 인식합니다. 날짜만 쓰면 기본 발송 시간에 보냅니다.
          </li>
          <li>
            <b>발송일시를 비우면 대기열</b>에 들어가 설정한 요일·시간({days.map((d) => DAY_LABELS[d]).join("·")} {s.defaultSendTime})마다 위에서부터 하나씩 발송됩니다.
          </li>
          <li>
            <b>수신자</b>를 비우면 전체 구독자에게, 이메일을 쉼표로 적으면 해당 사람에게만 보냅니다. <b>사용</b> 열에 N / 보류 / X를 쓰면 발송하지 않습니다.
          </li>
          <li>
            제목·본문에 <code>{"{{이름}}"}</code>을 쓰면 구독자 이름으로 바뀝니다. 한 번 발송된 행은 다시 발송되지 않습니다 (제목이나 발송일시를 바꾸면 새 콘텐츠로 인식).
          </li>
        </ul>
        {nextQueueSlot(s) === null && days.length === 0 && (
          <p className="mt-2 text-xs text-rose-600">기본 발송 요일이 없어 대기열 콘텐츠는 발송되지 않습니다.</p>
        )}
      </section>
    </div>
  );
}
