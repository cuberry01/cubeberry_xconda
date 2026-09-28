import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { Flash, type FlashParams } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { getSettings } from "@/lib/settings";
import { formatKst } from "@/lib/time";
import { desc } from "drizzle-orm";
import { addSubscribersAction, deleteSubscriberAction, syncAction, toggleSubscriberAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SubscribersPage({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const s = await getSettings();
  const list = await db.select().from(subscribers).orderBy(desc(subscribers.createdAt));
  const active = list.filter((x) => x.active).length;

  return (
    <div>
      <Flash msg={sp.msg} err={sp.err} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-1 font-semibold">구독자 추가</h2>
            <p className="mb-3 text-xs text-slate-500">
              한 줄에 한 명씩 입력하세요. <br />
              예: <code>hong@example.com, 홍길동</code> 또는 <code>홍길동 &lt;hong@example.com&gt;</code>
            </p>
            <form action={addSubscribersAction} className="space-y-3">
              <textarea
                name="bulk"
                rows={8}
                required
                placeholder={"hong@example.com, 홍길동\nkim@example.com"}
                className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <SubmitButton className="w-full">추가하기</SubmitButton>
            </form>
          </section>
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-1 font-semibold">시트에서 구독자 불러오기</h2>
            {s.subscribersSheetUrl ? (
              <>
                <p className="mb-3 break-all text-xs text-slate-500">{s.subscribersSheetUrl}</p>
                <form action={syncAction}>
                  <SubmitButton variant="secondary" className="w-full">
                    🔄 지금 동기화
                  </SubmitButton>
                </form>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                <a href="/settings" className="text-indigo-600 underline">
                  설정
                </a>
                에서 구독자 시트(탭) URL을 입력하면 &apos;이메일&apos;, &apos;이름&apos; 열을 자동으로 가져옵니다.
              </p>
            )}
          </section>
        </div>

        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 lg:col-span-2">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">
              구독자 {list.length}명 <span className="text-sm font-normal text-slate-500">(수신 중 {active}명)</span>
            </h2>
          </div>
          {list.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">아직 구독자가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">이메일</th>
                    <th className="px-4 py-2 font-medium">이름</th>
                    <th className="px-4 py-2 font-medium">출처</th>
                    <th className="px-4 py-2 font-medium">등록일</th>
                    <th className="px-4 py-2 font-medium">상태</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((x) => (
                    <tr key={x.id}>
                      <td className="px-4 py-2.5 font-medium">{x.email}</td>
                      <td className="px-4 py-2.5 text-slate-600">{x.name || "-"}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{x.source === "sheet" ? "시트" : "직접 입력"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{formatKst(x.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            x.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {x.active ? "수신" : "수신거부"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <form action={toggleSubscriberAction}>
                            <input type="hidden" name="id" value={x.id} />
                            <SubmitButton variant="ghost">{x.active ? "중지" : "재개"}</SubmitButton>
                          </form>
                          <form action={deleteSubscriberAction}>
                            <input type="hidden" name="id" value={x.id} />
                            <SubmitButton variant="danger" confirm={`${x.email}을(를) 삭제할까요?`}>
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
        </section>
      </div>
    </div>
  );
}
