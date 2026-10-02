import { db } from "@/db";
import { sendLogs } from "@/db/schema";
import { IconHistory, IconMail, IconSend } from "@/components/icons";
import { Badge, EmptyState, PageHeader, Panel, StatCard } from "@/components/ui";
import { formatKst } from "@/lib/time";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const metadata = { title: "발송 기록" };

function statusBadge(status: string) {
  if (status === "sent") return <Badge tone="ok">발송</Badge>;
  if (status === "test") return <Badge tone="info">테스트</Badge>;
  return <Badge tone="danger">실패</Badge>;
}

export default async function LogsPage() {
  const logs = await db.select().from(sendLogs).orderBy(desc(sendLogs.id)).limit(300);
  const sent = logs.filter((l) => l.status === "sent").length;
  const failed = logs.filter((l) => l.status !== "sent" && l.status !== "test").length;
  const test = logs.filter((l) => l.status === "test").length;
  const successRate = sent + failed > 0 ? Math.round((sent / (sent + failed)) * 100) : null;

  return (
    <div>
      <PageHeader
        eyebrow="뉴스레터"
        title="발송 기록"
        description="최근 300건의 발송 결과입니다. 실패한 주소와 원인을 확인해 다음 발송에 반영하세요."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="발송 성공"
          icon={<IconSend className="h-3.5 w-3.5" />}
          tone="ok"
          value={`${sent}건`}
          hint={successRate === null ? "아직 발송 기록이 없습니다" : `실패 제외 성공률 ${successRate}%`}
        />
        <StatCard
          label="실패"
          icon={<IconMail className="h-3.5 w-3.5" />}
          tone={failed > 0 ? "danger" : "off"}
          value={`${failed}건`}
          hint={failed > 0 ? "아래 표에서 원인을 확인하세요" : "실패 없음"}
        />
        <StatCard
          label="테스트 발송"
          icon={<IconHistory className="h-3.5 w-3.5" />}
          tone={test > 0 ? "info" : "off"}
          value={`${test}건`}
          hint="테스트 모드에서는 실제 메일이 나가지 않습니다"
        />
      </div>

      <Panel
        title={`발송 로그 (${logs.length})`}
        icon={<IconHistory className="h-4 w-4 text-emerald-300" />}
        description="최신순으로 표시됩니다."
        bodyClassName=""
      >
        {logs.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<IconHistory className="h-5 w-5" />}
              title="아직 발송 기록이 없습니다"
              description="콘텐츠를 발송하면 결과가 여기에 쌓입니다."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">최근 발송 기록 300건</caption>
              <thead className="bg-surface-2/50 text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    시각
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    제목
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    수신자
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    결과
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    방식
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {logs.map((l) => (
                  <tr key={l.id} className="align-top transition-colors duration-150 hover:bg-surface-2/30">
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted">{formatKst(l.createdAt)}</td>
                    <td className="max-w-sm px-4 py-3 text-ink-2">{l.subject}</td>
                    <td className="px-4 py-3 text-ink-2">{l.email}</td>
                    <td className="px-4 py-3">
                      {statusBadge(l.status)}
                      {l.error && <div className="mt-1 max-w-xs text-xs leading-5 text-rose-300">{l.error}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{l.provider === "test" ? "테스트 모드" : l.provider || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
