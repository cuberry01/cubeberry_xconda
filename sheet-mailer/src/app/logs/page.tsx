import { db } from "@/db";
import { sendLogs } from "@/db/schema";
import { formatKst } from "@/lib/time";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const logs = await db.select().from(sendLogs).orderBy(desc(sendLogs.id)).limit(300);
  const badge = (s: string) =>
    s === "sent"
      ? ["발송", "bg-emerald-100 text-emerald-700"]
      : s === "test"
        ? ["테스트", "bg-sky-100 text-sky-700"]
        : ["실패", "bg-rose-100 text-rose-700"];

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold">발송 기록</h2>
        <p className="text-xs text-slate-500">최근 300건</p>
      </div>
      {logs.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500">아직 발송 기록이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">시각</th>
                <th className="px-4 py-2 font-medium">제목</th>
                <th className="px-4 py-2 font-medium">수신자</th>
                <th className="px-4 py-2 font-medium">결과</th>
                <th className="px-4 py-2 font-medium">방식</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => {
                const [label, cls] = badge(l.status);
                return (
                  <tr key={l.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{formatKst(l.createdAt)}</td>
                    <td className="max-w-sm px-4 py-2.5">{l.subject}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.email}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
                      {l.error && <div className="mt-1 max-w-xs text-xs text-rose-600">{l.error}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{l.provider === "test" ? "테스트 모드" : l.provider || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
