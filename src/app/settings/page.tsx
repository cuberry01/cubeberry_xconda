import { Flash, type FlashParams } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { getProvider, providerLabel } from "@/lib/mailer";
import { parseSendDays } from "@/lib/scheduler";
import { getSettings } from "@/lib/settings";
import { saveSettingsAction } from "../actions";

export const dynamic = "force-dynamic";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";

export default async function SettingsPage({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const s = await getSettings();
  const days = parseSendDays(s.sendDays);
  const provider = getProvider();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Flash msg={sp.msg} err={sp.err} />
        <form action={saveSettingsAction} className="space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div>
            <label className="mb-1 block text-sm font-medium">콘텐츠 스프레드시트 URL</label>
            <input name="sheetUrl" defaultValue={s.sheetUrl} className={input} placeholder="https://docs.google.com/spreadsheets/d/…/edit" />
            <p className="mt-1 text-xs text-slate-500">
              특정 탭을 쓰려면 해당 탭을 연 상태의 URL(<code>#gid=…</code> 포함)을 붙여넣으세요. 공유: 링크가 있는 모든 사용자 – 뷰어.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              구독자 시트 URL <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <input
              name="subscribersSheetUrl"
              defaultValue={s.subscribersSheetUrl}
              className={input}
              placeholder="같은 파일의 '구독자' 탭 URL (#gid=…)"
            />
            <p className="mt-1 text-xs text-slate-500">
              &apos;이메일&apos;, &apos;이름&apos; 열을 읽어 구독자로 등록합니다. 수신거부한 사람은 다시 활성화되지 않습니다.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">기본 발송 시간 (KST)</label>
              <input type="time" name="defaultSendTime" defaultValue={s.defaultSendTime} className={input} required />
              <p className="mt-1 text-xs text-slate-500">발송일시가 비어 있는 콘텐츠(대기열)와 날짜만 쓴 콘텐츠에 적용</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">대기열 발송 요일</label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => (
                  <label key={d} className="cursor-pointer">
                    <input type="checkbox" name="sendDays" value={i} defaultChecked={days.includes(i)} className="peer sr-only" />
                    <span className="grid h-9 w-9 place-items-center rounded-lg text-sm ring-1 ring-slate-300 peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:ring-indigo-600">
                      {d}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">선택한 요일마다 대기열에서 1건씩 발송</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">보내는 사람 이름</label>
              <input name="fromName" defaultValue={s.fromName} className={input} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">테스트 수신 이메일</label>
              <input type="email" name="testEmail" defaultValue={s.testEmail} className={input} placeholder="me@example.com" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">서비스 주소 (수신거부 링크용)</label>
            <input name="baseUrl" defaultValue={s.baseUrl} className={input} placeholder="https://your-app.example.com" />
            <p className="mt-1 text-xs text-slate-500">비워두면 처음 접속한 주소로 자동 설정됩니다.</p>
          </div>

          <div className="flex justify-end">
            <SubmitButton>설정 저장</SubmitButton>
          </div>
        </form>
      </div>

      <aside className="space-y-6">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-2 font-semibold">📮 메일 발송 설정</h2>
          <p className="mb-3 text-sm">
            현재: <b className={provider === "test" ? "text-amber-600" : "text-emerald-600"}>{providerLabel(provider)}</b>
          </p>
          <p className="mb-2 text-xs text-slate-600">아래 환경변수(시크릿) 중 하나를 설정하세요.</p>
          <div className="space-y-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-1 font-semibold">Gmail / SMTP</div>
              <pre className="whitespace-pre-wrap text-[11px] leading-5 text-slate-700">{`SMTP_USER=you@gmail.com
SMTP_PASS=앱비밀번호16자리
SMTP_HOST=smtp.gmail.com   (선택)
SMTP_PORT=465              (선택)
MAIL_FROM=you@gmail.com    (선택)`}</pre>
              <p className="mt-1 text-slate-500">Gmail은 2단계 인증 후 &apos;앱 비밀번호&apos;를 발급해 사용합니다 (하루 약 500통 제한).</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-1 font-semibold">Resend (대량 발송 추천)</div>
              <pre className="whitespace-pre-wrap text-[11px] leading-5 text-slate-700">{`RESEND_API_KEY=re_...
MAIL_FROM=news@your-domain.com`}</pre>
            </div>
          </div>
        </section>
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-2 font-semibold">⏱ 스케줄러</h2>
          <p className="text-xs leading-5 text-slate-600">
            서버가 켜져 있는 동안 매 1분마다 시트를 읽고 발송 시각이 된 콘텐츠를 보냅니다. 서버리스 환경에서는 외부 크론으로{" "}
            <code className="rounded bg-slate-100 px-1">GET /api/cron</code>을 1분마다 호출하세요 (<code>CRON_SECRET</code> 설정 시{" "}
            <code>?secret=…</code> 필요). 같은 콘텐츠가 두 번 발송되지 않도록 잠금 처리되어 있습니다.
          </p>
        </section>
      </aside>
    </div>
  );
}
