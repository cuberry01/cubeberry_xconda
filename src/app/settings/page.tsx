import { Flash, type FlashParams } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { IconClock, IconInfo, IconMail, IconSettings } from "@/components/icons";
import { Badge, PageHeader, Panel, hintClass, inputClass, labelClass } from "@/components/ui";
import { getProvider, providerLabel } from "@/lib/mailer";
import { parseSendDays } from "@/lib/scheduler";
import { getSettings } from "@/lib/settings";
import { saveSettingsAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "설정" };

export default async function SettingsPage({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const s = await getSettings();
  const days = parseSendDays(s.sendDays);
  const provider = getProvider();

  return (
    <div>
      <Flash msg={sp.msg} err={sp.err} />

      <PageHeader
        eyebrow="뉴스레터"
        title="설정"
        description="콘텐츠 스프레드시트와 발송 기본값을 관리합니다. 시크릿 키는 배포 환경변수로만 설정합니다."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="기본 설정"
          icon={<IconSettings className="h-4 w-4 text-emerald-300" />}
          className="lg:col-span-2"
          bodyClassName=""
        >
          <form action={saveSettingsAction} className="space-y-6 p-5">
            <div>
              <label className={labelClass} htmlFor="sheet-url">
                콘텐츠 스프레드시트 URL
              </label>
              <input
                id="sheet-url"
                name="sheetUrl"
                defaultValue={s.sheetUrl}
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
                placeholder="https://docs.google.com/spreadsheets/d/…/edit"
              />
              <p className={hintClass}>
                특정 탭을 쓰려면 해당 탭을 연 상태의 URL(<code className="font-mono">#gid=…</code> 포함)을 붙여넣으세요.
                공유 설정: 링크가 있는 모든 사용자 – 뷰어.
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="subscribers-sheet">
                구독자 시트 URL <span className="font-normal text-faint">(선택)</span>
              </label>
              <input
                id="subscribers-sheet"
                name="subscribersSheetUrl"
                defaultValue={s.subscribersSheetUrl}
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
                placeholder="같은 파일의 '구독자' 탭 URL (#gid=…)"
              />
              <p className={hintClass}>
                &apos;이메일&apos;, &apos;이름&apos; 열을 읽어 구독자로 등록합니다. 수신거부한 사람은 다시 활성화되지
                않습니다.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="default-time">
                  기본 발송 시간 (KST)
                </label>
                <input
                  id="default-time"
                  type="time"
                  name="defaultSendTime"
                  defaultValue={s.defaultSendTime}
                  className={inputClass}
                  required
                />
                <p className={hintClass}>발송일시가 비어 있는 콘텐츠(대기열)와 날짜만 쓴 콘텐츠에 적용됩니다.</p>
              </div>
              <div>
                <label className={labelClass} htmlFor="daily-limit">
                  앱 하루 발송 한도 (명)
                </label>
                <input
                  id="daily-limit"
                  type="number"
                  name="dailyLimit"
                  min={0}
                  max={100000}
                  step={1}
                  defaultValue={s.dailyLimit}
                  className={inputClass}
                  required
                />
                <p className={hintClass}>
                  이 앱의 자체 제한이며 한국 시간 자정에 초기화됩니다. 기본값 500은 Gmail 무료 계정의 통상 한도를 고려한
                  값입니다. Gmail 제공자 한도는 별도 적용되며, 550 5.4.5 응답 시 발송을 중지합니다. 0은 앱 한도만
                  해제하며 Gmail 한도를 늘리지 않습니다. 초과분은 다음 발송 가능 시간에 이어서 보냅니다.
                </p>
              </div>
            </div>

            <div>
              <fieldset>
                <legend className={labelClass}>대기열 발송 요일</legend>
                <div className="flex flex-wrap gap-1.5">
                  {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                    <label key={d} className="cursor-pointer">
                      <input
                        type="checkbox"
                        name="sendDays"
                        value={i}
                        defaultChecked={days.includes(i)}
                        className="peer sr-only"
                      />
                      <span className="grid h-11 w-11 place-items-center rounded-xl text-sm font-medium text-muted ring-1 ring-inset ring-line-strong/70 transition-colors duration-150 hover:text-ink peer-checked:bg-primary/15 peer-checked:text-emerald-300 peer-checked:ring-primary/40 peer-focus-visible:ring-2 peer-focus-visible:ring-primary sm:h-9 sm:w-9">
                        {d}
                      </span>
                    </label>
                  ))}
                </div>
                <p className={hintClass}>선택한 요일마다 대기열에서 1건씩 발송합니다.</p>
              </fieldset>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="from-name">
                  보내는 사람 이름
                </label>
                <input id="from-name" name="fromName" defaultValue={s.fromName} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="test-email">
                  테스트 수신 이메일
                </label>
                <input
                  id="test-email"
                  type="email"
                  name="testEmail"
                  defaultValue={s.testEmail}
                  className={inputClass}
                  placeholder="me@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="base-url">
                서비스 주소 (수신거부 링크용)
              </label>
              <input
                id="base-url"
                name="baseUrl"
                defaultValue={s.baseUrl}
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
                placeholder="https://your-app.example.com"
              />
              <p className={hintClass}>비워두면 처음 접속한 주소로 자동 설정됩니다.</p>
            </div>

            <div className="flex justify-end border-t border-line/70 pt-5">
              <SubmitButton pendingText="저장 중…">설정 저장</SubmitButton>
            </div>
          </form>
        </Panel>

        <aside className="space-y-6">
          <Panel title="메일 발송 설정" icon={<IconMail className="h-4 w-4 text-emerald-300" />}>
            <p className="flex items-center gap-2 text-sm">
              <span className="text-muted">현재 방식</span>
              <Badge tone={provider === "test" ? "warn" : "ok"}>{providerLabel(provider)}</Badge>
            </p>
            <p className="mt-3 text-xs leading-5 text-muted">
              아래 환경변수(시크릿) 중 하나를 설정하세요. 설정하지 않으면 테스트 모드로 기록만 남습니다.
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-line/70 bg-canvas/50 p-3">
                <p className="mb-1.5 text-xs font-semibold text-ink-2">Gmail / SMTP</p>
                <pre className="overflow-x-auto font-mono text-[11px] leading-5 text-muted">{`SMTP_USER=you@gmail.com
SMTP_PASS=앱비밀번호16자리
SMTP_HOST=smtp.gmail.com   (선택)
SMTP_PORT=465              (선택)
MAIL_FROM=you@gmail.com    (선택)`}</pre>
                <p className="mt-1.5 text-[11px] leading-5 text-faint">
                  Gmail은 2단계 인증 후 &apos;앱 비밀번호&apos;를 발급해 사용합니다. Gmail 한도 초과(550 5.4.5) 시 같은 배치의 재시도를 멈추고 24시간 쿨다운합니다. 대량 뉴스레터는 수신 동의와 도메인 인증을 지원하는 이메일 서비스(예: Resend)를 사용하세요.
                </p>
              </div>
              <div className="rounded-xl border border-line/70 bg-canvas/50 p-3">
                <p className="mb-1.5 text-xs font-semibold text-ink-2">Resend (대량 발송 추천)</p>
                <pre className="overflow-x-auto font-mono text-[11px] leading-5 text-muted">{`RESEND_API_KEY=re_...
MAIL_FROM=news@your-domain.com`}</pre>
              </div>
            </div>
          </Panel>

          <Panel title="스케줄러" icon={<IconClock className="h-4 w-4 text-emerald-300" />}>
            <p className="text-xs leading-5 text-muted">
              서버가 켜져 있는 동안 매 1분마다 시트를 읽고 발송 시각이 된 콘텐츠를 보냅니다. 서버리스 환경에서는 외부
              크론으로{" "}
              <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">GET /api/cron</code>을 1분마다 호출하세요.
            </p>
            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted">
              <IconInfo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
              <span>
                <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">CRON_SECRET</code> 설정 시{" "}
                <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">?secret=…</code>가 필요합니다. 같은
                콘텐츠가 두 번 발송되지 않도록 잠금 처리되어 있습니다.
              </span>
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
