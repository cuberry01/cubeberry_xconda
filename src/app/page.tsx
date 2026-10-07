import Link from "next/link";
import { Flash, type FlashParams } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { IconImage, IconInbox, IconMail, IconRefresh, IconSend, IconUsers, IconZap } from "@/components/icons";
import {
  Badge,
  Callout,
  EmptyState,
  LinkButton,
  Meter,
  PageHeader,
  Panel,
  StatCard,
  type BadgeTone,
} from "@/components/ui";
import { db } from "@/db";
import { contents, subscribers, type Content } from "@/db/schema";
import { getProvider, providerLabel } from "@/lib/mailer";
import { getQuotaStatus } from "@/lib/quota";
import { GRACE_MS, nextQueueSlot, parseSendDays, plannedTimes } from "@/lib/scheduler";
import { getSettings, updateSettings } from "@/lib/settings";
import { splitEmails } from "@/lib/sheet";
import { formatKst, formatRelativeKst, kstDateKey } from "@/lib/time";
import { asc, count, eq, or } from "drizzle-orm";
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
// 시트 동기화 + 전체 발송까지 한 번의 요청에서 끝낼 시간을 확보한다.
export const maxDuration = 60;

export const metadata = { title: "뉴스레터 대시보드" };

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function statusBadge(c: Content, now: Date): { label: string; tone: BadgeTone } {
  if (c.status === "sent") return { label: "발송 완료", tone: "ok" };
  if (c.status === "failed") return { label: "실패", tone: "danger" };
  if (c.status === "sending") return { label: "발송 중", tone: "info" };
  if (c.status === "partial") return { label: "부분 발송", tone: "warn" };
  if (!c.active) return { label: "보류", tone: "muted" };
  if (c.scheduledAt && c.scheduledAt.getTime() < now.getTime() - GRACE_MS) return { label: "기한 지남", tone: "warn" };
  if (c.scheduledAt) return { label: "예약됨", tone: "accent" };
  return { label: "대기", tone: "neutral" };
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
    .where(or(eq(contents.inSheet, true), eq(contents.source, "xconda")))
    .orderBy(asc(contents.rowNumber));
  const [{ value: subCount }] = await db
    .select({ value: count() })
    .from(subscribers)
    .where(eq(subscribers.active, true));

  const now = new Date();
  const quota = await getQuotaStatus(s, now);
  const planned = plannedTimes(list, s);
  const upcoming = list
    .filter((c) => c.status === "pending" && c.active)
    .map((c) => ({ c, at: c.scheduledAt ?? planned.get(c.id) ?? null }))
    .filter((x) => x.at && x.at.getTime() >= now.getTime() - 60000)
    .sort((a, b) => a.at!.getTime() - b.at!.getTime())[0];
  const partials = list.filter((c) => c.status === "partial");
  const resumeSlot = partials.length ? nextQueueSlot({ ...s, lastQueueSentDate: kstDateKey(now) }, now) : null;
  const provider = getProvider();
  const days = parseSendDays(s.sendDays);
  const tickAlive = s.lastTickAt && now.getTime() - s.lastTickAt.getTime() < 3 * 60 * 1000;
  const quotaUsedPct = quota.unlimited ? 0 : Math.min(100, Math.round((quota.used / Math.max(1, quota.limit)) * 100));

  return (
    <div>
      <Flash msg={sp.msg} err={sp.err} />

      <PageHeader
        eyebrow="Newsletter"
        title="뉴스레터 대시보드"
        description={`스프레드시트에서 콘텐츠를 불러와 구독자 전체에게 발송합니다. 앱 자체 하루 한도는 ${
          quota.unlimited ? "무제한" : `${quota.limit}명`
        }(한국 시간 자정 초기화)이며, 메일 제공자 한도는 별도로 적용됩니다. 제공자가 발송을 거부하면 자동 중단합니다.`}
        actions={
          <>
            <form action={syncAction}>
              <input type="hidden" name="returnTo" value="/" />
              <SubmitButton pendingText="불러오는 중…">
                <IconRefresh className="h-4 w-4" />
                시트 불러오기
              </SubmitButton>
            </form>
            <form action={tickAction}>
              <SubmitButton variant="secondary" pendingText="실행 중…">
                <IconZap className="h-4 w-4" />스케줄러 지금 실행
              </SubmitButton>
            </form>
          </>
        }
      />

      {provider === "test" && (
        <Callout tone="warn" title="메일 서버 미설정 — 테스트 모드" className="mb-4">
          발송 기록만 남고 실제 메일은 보내지 않습니다. 실제로 보내려면 환경변수에{" "}
          <code className="rounded bg-amber-400/10 px-1 font-mono text-[11px]">SMTP_USER</code> ·{" "}
          <code className="rounded bg-amber-400/10 px-1 font-mono text-[11px]">SMTP_PASS</code> (Gmail 앱 비밀번호) 또는{" "}
          <code className="rounded bg-amber-400/10 px-1 font-mono text-[11px]">RESEND_API_KEY</code>를 추가하세요. 자세한 내용은{" "}
          <Link href="/settings" className="underline">
            설정
          </Link>
          참고.
        </Callout>
      )}
      {quota.providerBlocked && (
        <Callout tone="danger" title="Gmail 일일 발송 한도 초과 (550 5.4.5)" className="mb-4">
          Google이 계정 발송 한도를 거부해 대량 발송을 중단했습니다. 자동 재시도는{" "}
          <b>{quota.providerBlockedUntil ? formatKst(quota.providerBlockedUntil) : "24시간 후"}</b>까지 멈추며, 이후 허용된 발송 시간에 미발송분을 이어서 보냅니다.
          앱의 하루 발송 한도를 올려도 Gmail 한도는 늘어나지 않습니다. 대량 뉴스레터에는{" "}
          <Link href="/settings" className="underline">
            설정의 Resend 안내
          </Link>
          를 확인하세요.
        </Callout>
      )}
      {!quota.providerBlocked && !quota.unlimited && quota.remaining <= 0 && (
        <Callout tone="warn" title={`오늘 앱 발송 한도(${quota.limit}통)를 모두 사용했습니다`} className="mb-4">
          남은 발송 건은 내일 한국 시간 {s.defaultSendTime}부터 이어서 보내집니다. 한도를 조정하려면{" "}
          <Link href="/settings" className="underline">
            설정
          </Link>
          에서 &apos;하루 발송 한도&apos;를 바꾸세요. (메일 제공자의 한도는 별도 적용됩니다.)
        </Callout>
      )}
      {s.lastSyncError && (
        <Callout tone="danger" title="마지막 시트 동기화 실패" className="mb-4">
          {s.lastSyncError}
        </Callout>
      )}
      {days.length === 0 && (
        <Callout tone="danger" title="대기열 발송 요일이 없습니다" className="mb-4">
          발송 요일이 모두 해제되어 예약 없는 콘텐츠는 발송되지 않습니다.{" "}
          <Link href="/settings" className="underline">
            설정
          </Link>
          에서 요일을 선택하세요.
        </Callout>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="자동 발송"
          icon={<IconZap className="h-3.5 w-3.5" />}
          tone={s.enabled ? "ok" : "off"}
          value={s.enabled ? "켜짐" : "꺼짐"}
          hint={`스케줄러 ${tickAlive ? "정상 동작 중" : "대기"} · 마지막 확인 ${formatKst(s.lastTickAt)}`}
          footer={
            <form action={toggleEnabledAction}>
              <SubmitButton variant={s.enabled ? "secondary" : "primary"} size="sm" className="w-full">
                {s.enabled ? "자동 발송 끄기" : "자동 발송 켜기"}
              </SubmitButton>
            </form>
          }
        />
        <StatCard
          label="오늘 발송량"
          icon={<IconSend className="h-3.5 w-3.5" />}
          tone={quota.providerBlocked ? "danger" : quota.unlimited ? "info" : quotaUsedPct >= 100 ? "danger" : quotaUsedPct >= 80 ? "warn" : "ok"}
          value={
            quota.providerBlocked
              ? `${quota.used}통 (일시 중지)`
              : quota.unlimited
                ? `${quota.used}통 (무제한)`
                : `${quota.used} / ${quota.limit}통`
          }
          hint={
            quota.providerBlocked
              ? `Gmail 한도 초과 · ${formatRelativeKst(quota.providerBlockedUntil, now)} 재개 예정`
              : quota.unlimited
                ? "앱 하루 한도 없음 · 메일 제공자 한도는 별도 적용"
                : `오늘 앱 한도 ${quota.remaining}통 남음 · 한국 시간 자정 초기화`
          }
          footer={
            !quota.unlimited && (
              <Meter
                value={quota.used}
                max={quota.limit}
                tone={quotaUsedPct >= 100 ? "danger" : quotaUsedPct >= 80 ? "warn" : "ok"}
                label="하루 한도 사용률"
              />
            )
          }
        />
        <StatCard
          label="다음 발송"
          icon={<IconMail className="h-3.5 w-3.5" />}
          tone={upcoming ? "info" : "off"}
          value={upcoming?.at ? formatKst(upcoming.at) : "예정 없음"}
          hint={
            partials.length
              ? `이어 보낼 콘텐츠 ${partials.length}건 — ${resumeSlot ? formatKst(resumeSlot) : "다음 발송 요일"} 재개`
              : upcoming
                ? upcoming.c.subject
                : "시트에 콘텐츠를 추가하세요"
          }
        />
        <StatCard
          label="활성 구독자"
          icon={<IconUsers className="h-3.5 w-3.5" />}
          href="/subscribers"
          value={`${subCount.toLocaleString()}명`}
          hint={`발송 방식: ${providerLabel(provider)}`}
        />
      </div>

      <Panel
        title={`콘텐츠 목록 (${list.length})`}
        icon={<IconInbox className="h-4 w-4 text-emerald-300" />}
        description={
          s.sheetUrl ? (
            <>
              수신자 열을 비우면 <b className="text-ink-2">전체 구독자</b>에게 발송합니다. 마지막 동기화:{" "}
              {formatKst(s.lastSyncedAt)}
            </>
          ) : (
            "설정에서 콘텐츠 스프레드시트 URL을 먼저 입력하세요."
          )
        }
        bodyClassName=""
      >
        {list.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<IconInbox className="h-5 w-5" />}
              title="아직 불러온 콘텐츠가 없습니다"
              description="시트에 머리글(발송일시, 제목, 본문, 링크, 이미지, 수신자, 사용)과 콘텐츠를 작성한 뒤 '시트 불러오기'를 누르세요."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">콘텐츠 발송 대기 목록</caption>
              <thead className="bg-surface-2/50 text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">행</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">발송 시각</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">제목 / 본문</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">수신자</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">상태</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {list.map((c) => {
                  const plan = c.scheduledAt ?? planned.get(c.id) ?? null;
                  const rc = c.recipients ? splitEmails(c.recipients).length : null;
                  const badge = statusBadge(c, now);
                  return (
                    <tr key={c.id} className="align-top transition-colors duration-150 hover:bg-surface-2/30">
                      <td className="px-5 py-3 font-mono text-xs text-faint">{c.rowNumber}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {c.status === "sent" ? (
                          <span className="text-xs text-muted">{formatKst(c.sentAt)}</span>
                        ) : c.status === "partial" ? (
                          <>
                            <div className="text-xs font-medium text-amber-300">
                              {resumeSlot ? formatKst(resumeSlot) : "다음 발송 요일"} 재개
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted">이어 보내기 대기</div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs text-ink-2">{formatKst(plan)}</div>
                            <div className="mt-0.5 text-[11px] text-faint">
                              {c.scheduledAt ? "지정 일시 (예약)" : "대기열 (기본 시간)"}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <div className="flex items-start gap-2">
                          {c.imageUrl && (
                            <IconImage className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" aria-label="이미지 포함" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink">{c.subject}</div>
                            <div className="line-clamp-2 text-xs leading-5 text-muted">{c.body}</div>
                            {c.error && <div className="mt-1 text-xs leading-5 text-rose-300">{c.error}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-2">
                        {rc === null ? `전체 (${subCount.toLocaleString()}명)` : `지정 ${rc}명`}
                        {c.sentCount > 0 && (
                          <div className="mt-0.5 text-[11px] text-emerald-300">
                            {c.sentCount}명 발송{c.status === "partial" ? " · 남음" : ""}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          <LinkButton href={`/preview/${c.id}`} external variant="ghost" size="sm">
                            미리보기
                          </LinkButton>
                          <form action={testSendAction}>
                            <input type="hidden" name="id" value={c.id} />
                            <SubmitButton variant="ghost" size="sm" pendingText="…">
                              테스트
                            </SubmitButton>
                          </form>
                          {c.status !== "sending" && (
                            <form action={sendNowAction}>
                              <input type="hidden" name="id" value={c.id} />
                              <SubmitButton
                                variant={c.status === "partial" ? "primary" : "secondary"}
                                size="sm"
                                confirm={`"${c.subject}"을(를) ${
                                  rc === null ? `전체 구독자 ${subCount}명` : `${rc}명`
                                }에게 ${
                                  c.status === "partial"
                                    ? "미발송분을 이어 보내"
                                    : c.status === "sent" || c.status === "failed"
                                      ? "성공 기록이 없는 주소만 재시도"
                                      : "발송"
                                }할까요?\n이미 성공한 주소는 중복 발송하지 않습니다.${
                                  quota.providerBlocked
                                    ? `\nGmail 한도 초과로 발송이 멈춰 있습니다 (${quota.providerBlockedUntil ? formatKst(quota.providerBlockedUntil) : "24시간 후"} 이후 재개).`
                                    : !quota.unlimited && quota.remaining <= 0
                                      ? "\n오늘 앱 한도가 소진되어 내일부터 발송됩니다."
                                      : ""
                                }`}
                                pendingText="발송 중…"
                              >
                                {c.status === "partial"
                                  ? "이어 보내기"
                                  : c.status === "sent"
                                    ? "미발송분 재시도"
                                    : c.status === "failed"
                                      ? "재시도"
                                      : "지금 발송"}
                              </SubmitButton>
                            </form>
                          )}
                          {(c.status === "sent" || c.status === "failed" || c.status === "partial") && (
                            <form action={resetStatusAction}>
                              <input type="hidden" name="id" value={c.id} />
                              <SubmitButton variant="ghost" size="sm">
                                대기로
                              </SubmitButton>
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
      </Panel>

      <Panel
        title="시트 작성 방법"
        icon={<IconMail className="h-4 w-4 text-emerald-300" />}
        description="시트 첫 행에 아래 머리글을 입력하고 2행부터 콘텐츠를 한 줄씩 작성하세요. 제목만 필수이며, 시트 공유는 '링크가 있는 모든 사용자 – 뷰어'여야 합니다."
        className="mt-6"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <caption className="sr-only">시트 예시</caption>
            <thead className="bg-primary/10 text-emerald-300">
              <tr>
                {["발송일시", "제목", "본문", "링크", "이미지", "수신자", "사용"].map((hd) => (
                  <th key={hd} scope="col" className="border border-line/60 px-3 py-2 font-semibold">
                    {hd}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr>
                <td className="border border-line/60 px-3 py-2">2026-10-07 09:00</td>
                <td className="border border-line/60 px-3 py-2">{"{{이름}}님, 10월 소식입니다"}</td>
                <td className="border border-line/60 px-3 py-2">안녕하세요! 이번 달 업데이트를 전해드립니다…</td>
                <td className="border border-line/60 px-3 py-2">https://example.com/news</td>
                <td className="border border-line/60 px-3 py-2">구글 드라이브 공유 링크</td>
                <td className="border border-line/60 px-3 py-2 text-faint">(비우면 전체)</td>
                <td className="border border-line/60 px-3 py-2">Y</td>
              </tr>
              <tr>
                <td className="border border-line/60 px-3 py-2 text-faint">(비우면 대기열)</td>
                <td className="border border-line/60 px-3 py-2">주간 팁 #1</td>
                <td className="border border-line/60 px-3 py-2">**굵게** 표시와 줄바꿈이 적용됩니다</td>
                <td className="border border-line/60 px-3 py-2"></td>
                <td className="border border-line/60 px-3 py-2"></td>
                <td className="border border-line/60 px-3 py-2">a@x.com, b@y.com</td>
                <td className="border border-line/60 px-3 py-2">보류</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="mt-4 list-inside list-disc space-y-1.5 text-xs leading-5 text-muted">
          <li>
            <b className="text-ink-2">발송일시</b>를 적으면 그 시각(한국 시간)에 예약 발송합니다.{" "}
            <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">2026-10-07 09:00</code>,{" "}
            <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">2026. 10. 7 오전 9:00</code> 모두 인식합니다.
            비워두면 대기열에 들어가 설정한 요일·시간({days.map((d) => DAY_LABELS[d]).join("·") || "없음"}{" "}
            {s.defaultSendTime})마다 위에서부터 하나씩 발송됩니다.
          </li>
          <li>
            <b className="text-ink-2">이미지</b> 열에 구글 드라이브 링크(파일 공유 링크)를 붙여넣으면 메일에 표시되는
            주소로 자동 변환됩니다. 파일은 <b className="text-ink-2">&apos;링크가 있는 모든 사용자 – 뷰어&apos;</b>로
            공유되어 있어야 하며, 접근할 수 없으면 동기화 시 경고가 표시됩니다.
          </li>
          <li>
            <b className="text-ink-2">수신자</b>를 비우면 전체 구독자에게, 이메일을 쉼표로 적으면 해당 사람에게만
            보냅니다. <b className="text-ink-2">사용</b> 열에 N / 보류 / X를 쓰면 발송하지 않습니다.
          </li>
          <li>
            수신자가 앱 하루 한도({quota.unlimited ? "없음" : `${quota.limit}명`})보다 많으면 오늘 보낼 수 있는
            만큼 보내고 나머지는 다음 발송 가능 시간에 이어서 보냅니다. Gmail 등 제공자 한도는 별도이며, Gmail 550
            5.4.5 응답 시 24시간 발송을 멈춘 뒤 미발송분을 재개합니다. 이미 받은 사람에게 중복 발송하지 않습니다.
          </li>
          <li>
            제목·본문에 <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">{"{{이름}}"}</code>을 쓰면
            구독자 이름으로 바뀝니다. 같은 콘텐츠를 재시도할 때는 성공 로그가 있는 주소를 항상 건너뜁니다. 제목이나
            발송일시를 바꿔 새 콘텐츠가 되면 새 발송으로 취급됩니다.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
