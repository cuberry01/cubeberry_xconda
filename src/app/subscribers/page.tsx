import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { Flash, type FlashParams } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { IconExternal, IconRefresh, IconTrash, IconUsers } from "@/components/icons";
import { Badge, EmptyState, LinkButton, PageHeader, Panel, StatCard, hintClass, inputClass, labelClass } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { formatKst } from "@/lib/time";
import { desc } from "drizzle-orm";
import { addSubscribersAction, deleteSubscriberAction, syncAction, toggleSubscriberAction } from "../actions";

export const dynamic = "force-dynamic";
// 이 페이지의 Server Action이 대용량 구독자 시트를 동기화할 시간을 확보한다.
export const maxDuration = 60;

export const metadata = { title: "구독자" };

export default async function SubscribersPage({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const s = await getSettings();
  const list = await db.select().from(subscribers).orderBy(desc(subscribers.createdAt));
  const active = list.filter((x) => x.active).length;
  const fromSheet = list.filter((x) => x.source === "sheet").length;

  return (
    <div>
      <Flash msg={sp.msg} err={sp.err} />

      <PageHeader
        eyebrow="뉴스레터"
        title="구독자"
        description="뉴스레터를 받는 사람을 관리합니다. 시트에서 자동으로 가져오거나 직접 추가할 수 있습니다."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="전체 구독자"
          icon={<IconUsers className="h-3.5 w-3.5" />}
          value={`${list.length}명`}
          hint={`시트에서 ${fromSheet}명 · 직접 입력 ${list.length - fromSheet}명`}
        />
        <StatCard
          label="수신 중"
          tone="ok"
          value={`${active}명`}
          hint={list.length ? `전체의 ${Math.round((active / list.length) * 100)}%` : "구독자를 추가하세요"}
        />
        <StatCard
          label="수신 거부"
          tone={list.length - active > 0 ? "warn" : "off"}
          value={`${list.length - active}명`}
          hint="수신 거부한 주소는 다시 활성화되지 않습니다"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Panel title="구독자 추가" icon={<IconUsers className="h-4 w-4 text-emerald-300" />}>
            <form action={addSubscribersAction} className="space-y-3">
              <div>
                <label className={labelClass} htmlFor="bulk">
                  이메일 목록 <span className="text-rose-300">*</span>
                </label>
                <textarea
                  id="bulk"
                  name="bulk"
                  rows={7}
                  required
                  placeholder={"hong@example.com, 홍길동\nkim@example.com"}
                  className={`${inputClass} h-auto`}
                />
                <p className={hintClass}>
                  한 줄에 한 명씩 입력하세요. 예: <code className="font-mono">hong@example.com, 홍길동</code> 또는{" "}
                  <code className="font-mono">홍길동 &lt;hong@example.com&gt;</code>
                </p>
              </div>
              <SubmitButton className="w-full" pendingText="추가 중…">
                구독자 추가
              </SubmitButton>
            </form>
          </Panel>

          <Panel title="시트에서 구독자 불러오기" icon={<IconRefresh className="h-4 w-4 text-emerald-300" />}>
            {s.subscribersSheetUrl ? (
              <>
                <p className="mb-3 break-all font-mono text-[11px] leading-5 text-muted">{s.subscribersSheetUrl}</p>
                <form action={syncAction}>
                  <SubmitButton variant="secondary" className="w-full" pendingText="동기화 중…">
                    <IconRefresh className="h-4 w-4" />
                    지금 동기화
                  </SubmitButton>
                </form>
                <p className={hintClass}>
                  &apos;이메일&apos;, &apos;이름&apos; 열을 읽어 등록합니다. 수신거부한 사람은 다시 활성화되지 않습니다.
                </p>
              </>
            ) : (
              <EmptyState
                icon={<IconRefresh className="h-5 w-5" />}
                title="구독자 시트가 연결되지 않았습니다"
                description="설정에서 구독자 시트(탭) URL을 입력하면 자동으로 가져옵니다."
                action={
                  <LinkButton href="/settings">
                    설정 열기
                    <IconExternal className="h-3.5 w-3.5 opacity-70" />
                  </LinkButton>
                }
              />
            )}
          </Panel>
        </div>

        <Panel
          title={`구독자 목록 (${list.length})`}
          icon={<IconUsers className="h-4 w-4 text-emerald-300" />}
          description={list.length ? `수신 중 ${active}명` : undefined}
          className="lg:col-span-2"
          bodyClassName=""
        >
          {list.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<IconUsers className="h-5 w-5" />}
                title="아직 구독자가 없습니다"
                description="왼쪽에서 직접 추가하거나 시트를 연결해 한 번에 가져오세요."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">구독자 목록</caption>
                <thead className="bg-surface-2/50 text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      이메일
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      이름
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      출처
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      등록일
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      상태
                    </th>
                    <th scope="col" className="px-4 py-2.5">
                      <span className="sr-only">작업</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {list.map((x) => (
                    <tr key={x.id} className="transition-colors duration-150 hover:bg-surface-2/30">
                      <td className="px-5 py-3 font-medium text-ink">{x.email}</td>
                      <td className="px-4 py-3 text-ink-2">{x.name || "-"}</td>
                      <td className="px-4 py-3 text-xs text-muted">{x.source === "sheet" ? "시트" : "직접 입력"}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                        {formatKst(x.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={x.active ? "ok" : "muted"}>{x.active ? "수신" : "수신거부"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <form action={toggleSubscriberAction}>
                            <input type="hidden" name="id" value={x.id} />
                            <SubmitButton size="sm" variant="ghost" pendingText="…">
                              {x.active ? "중지" : "재개"}
                            </SubmitButton>
                          </form>
                          <form action={deleteSubscriberAction}>
                            <input type="hidden" name="id" value={x.id} />
                            <SubmitButton
                              size="sm"
                              variant="danger"
                              confirm={`${x.email}을(를) 삭제할까요?`}
                              pendingText="삭제 중…"
                            >
                              <IconTrash className="h-3.5 w-3.5" />
                              삭제
                            </SubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
