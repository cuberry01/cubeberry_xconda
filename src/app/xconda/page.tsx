import { Flash, type FlashParams } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { db } from "@/db";
import { xAccounts } from "@/db/schema";
import { formatKst } from "@/lib/time";
import { getXcondaConfig, missingConfig } from "@/lib/xconda/config";
import { getImageStorageBucketName, getImageStorageStatus } from "@/lib/xconda/image-storage";
import { getDatabaseInfo, queryItems } from "@/lib/xconda/notion";
import { STATUS_LABELS, type XItem, type XStatus } from "@/lib/xconda/types";
import { asc } from "drizzle-orm";
import {
  addAccountAction,
  checkAccountAction,
  createNotionDbAction,
  deleteAccountAction,
  ignoreAction,
  ingestAction,
  publishAction,
  retryAction,
  runTickAction,
  saveXSettingsAction,
  toggleAccountAction,
} from "./actions";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const STATUS_BADGE: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-700",
  EXTRACTED: "bg-sky-100 text-sky-700",
  SUMMARIZED: "bg-violet-100 text-violet-700",
  READY: "bg-amber-100 text-amber-700",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  EXTRACT_FAILED: "bg-rose-100 text-rose-700",
  AI_FAILED: "bg-rose-100 text-rose-700",
  PUBLISH_FAILED: "bg-rose-100 text-rose-700",
  IGNORED: "bg-stone-100 text-stone-500",
};

function badge(status: XStatus | "") {
  const cls = (status && STATUS_BADGE[status]) || "bg-slate-100 text-slate-700";
  const label = status ? STATUS_LABELS[status] : "미상";
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export default async function XcondaPage({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;

  // DB 미연결/마이그레이션 전에도 설정 안내가 보이도록 먼저 안전하게 읽는다
  let cfg: Awaited<ReturnType<typeof getXcondaConfig>> | null = null;
  let accounts: (typeof xAccounts.$inferSelect)[] = [];
  let dbError = "";
  try {
    cfg = await getXcondaConfig();
    accounts = await db.select().from(xAccounts).orderBy(asc(xAccounts.id));
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  if (!cfg) {
    return (
      <div>
        <Flash msg={sp.msg} err={sp.err} />
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-xl font-bold">X 수집 (Xconda)</h1>
          <p className="mt-2 text-sm text-rose-600">데이터베이스에 연결할 수 없습니다: {dbError}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>
              환경변수 <code className="rounded bg-slate-100 px-1">DATABASE_URL</code>에 Supabase 연결 문자열을 설정하세요.
            </li>
            <li>
              이어서 <code className="rounded bg-slate-100 px-1">supabase/migrations/20260930000000_xconda.sql</code>을 Supabase SQL
              Editor에서 실행하세요. (XCONDA_SETUP.md 참고)
            </li>
          </ul>
        </div>
      </div>
    );
  }

  const missing = missingConfig(cfg);
  const imageStorageStatus = getImageStorageStatus();

  let items: XItem[] = [];
  let dbInfo = null as Awaited<ReturnType<typeof getDatabaseInfo>> | null;
  let notionError = "";
  if (!missing.some((m) => m.includes("Notion")) && cfg.notionToken && cfg.notionDatabaseId) {
    try {
      dbInfo = await getDatabaseInfo(cfg);
      items = await queryItems(cfg, { pageSize: 50 });
    } catch (e) {
      notionError = e instanceof Error ? e.message : String(e);
    }
  }

  const notionReady = Boolean(cfg.notionToken && cfg.notionDatabaseId && !notionError);
  const geminiReady = Boolean(cfg.geminiApiKey);
  const publishedCount = items.filter((i) => i.status === "PUBLISHED").length;

  return (
    <div>
      <Flash msg={sp.msg} err={sp.err} />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">X 수집 (Xconda)</h1>
          <p className="mt-1 text-sm text-slate-500">
            X 게시물 URL → 본문 추출 → Gemini 요약 → Notion → 공지 페이지. 관제 계정은 RSS 브릿지로 자동 수집합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/notices"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50"
          >
            공지 페이지 ↗
          </a>
          <form action={runTickAction}>
            <SubmitButton variant="secondary" pendingText="실행 중…">
              ⏱ 지금 실행
            </SubmitButton>
          </form>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          아직 설정이 완료되지 않았습니다: <b>{missing.join(", ")}</b>. 배포 환경변수와 아래 설정을 채우면 바로 동작합니다.
          자세한 방법은 저장소의 <code className="rounded bg-amber-100 px-1">XCONDA_SETUP.md</code>를 참고하세요.
        </div>
      )}

      {/* 상태 카드 */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">Notion</div>
          <div className={`mt-1 text-lg font-bold ${notionReady ? "text-emerald-600" : "text-slate-400"}`}>
            {notionReady ? "● 연결됨" : "○ 미설정"}
          </div>
          <div className="mt-2 truncate text-xs text-slate-500">
            {notionReady ? dbInfo?.title || "DB" : notionError ? "오류" : "DB ID를 설정하세요"}
          </div>
          {dbInfo && dbInfo.missing.length > 0 && (
            <div className="mt-1 text-xs text-amber-600">누락 속성: {dbInfo.missing.join(", ")}</div>
          )}
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">Gemini</div>
          <div className={`mt-1 text-lg font-bold ${geminiReady ? "text-emerald-600" : "text-slate-400"}`}>
            {geminiReady ? "● 설정됨" : "○ 미설정"}
          </div>
          <div className="mt-2 truncate text-xs text-slate-500">{geminiReady ? cfg.geminiModel : "GEMINI_API_KEY 필요"}</div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">파이프라인</div>
          <div className={`mt-1 text-lg font-bold ${cfg.enabled ? "text-emerald-600" : "text-slate-400"}`}>
            {cfg.enabled ? "● 켜짐" : "○ 꺼짐"}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {cfg.autoPublish ? "자동 게시" : "수동 게시"} · 게시 시 메일 {cfg.emailOnPublish ? "발송" : "미발송"}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">관제 계정 / 게시</div>
          <div className="mt-1 text-lg font-bold">
            {accounts.filter((a) => a.enabled).length} / {publishedCount}
          </div>
          <div className="mt-2 text-xs text-slate-500">15분마다 피드 확인 (cron이 켜져 있을 때)</div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">이미지 보관</div>
          <div
            className={`mt-1 text-lg font-bold ${
              imageStorageStatus === "ready"
                ? "text-emerald-600"
                : imageStorageStatus === "incomplete"
                  ? "text-amber-600"
                  : "text-slate-400"
            }`}
          >
            {imageStorageStatus === "ready" ? "● 설정됨" : imageStorageStatus === "incomplete" ? "⚠ 설정 확인" : "○ 원본 URL 사용"}
          </div>
          <div className="mt-2 truncate text-xs text-slate-500">
            {imageStorageStatus === "ready"
              ? `Supabase Storage · ${getImageStorageBucketName()}`
              : imageStorageStatus === "incomplete"
                ? "SUPABASE_URL + SERVICE_ROLE_KEY 필요"
                : "환경변수를 설정하면 이미지 만료를 줄일 수 있습니다"}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* URL 수집 */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold">🔗 URL 수집</h2>
            <p className="mt-1 text-xs text-slate-500">
              X 게시물 URL을 붙여넣으면 즉시 추출 → Gemini 요약까지 진행합니다. 추출이 실패하는 비공개/삭제 게시물은 원문을 직접
              붙여넣으세요.
            </p>
            <form action={ingestAction} className="mt-4 space-y-3">
              <input name="url" className={input} placeholder="https://x.com/username/status/1234567890" required />
              <div className="grid gap-3 sm:grid-cols-3">
                <input name="author" className={input} placeholder="작성자 (선택, 예: @username)" />
                <div className="sm:col-span-2" />
              </div>
              <textarea
                name="text"
                className={`${input} h-24`}
                placeholder="원문 직접 붙여넣기 (선택) — 추출이 안 될 때 게시물 본문을 여기에 붙여넣으면 그대로 요약합니다"
              />
              <div className="flex justify-end">
                <SubmitButton pendingText="수집 · 요약 중…">수집 + AI 요약</SubmitButton>
              </div>
            </form>
          </section>

          {/* 수집 항목 */}
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold">수집 항목 ({items.length})</h2>
              <span className="text-xs text-slate-500">Notion DB가 콘텐츠 Inbox + 상태 저장소입니다</span>
            </div>
            {notionError ? (
              <div className="p-6 text-sm text-rose-600">Notion 조회 실패: {notionError}</div>
            ) : !notionReady ? (
              <div className="p-10 text-center text-sm text-slate-500">Notion 설정을 완료하면 수집 항목이 여기 표시됩니다.</div>
            ) : items.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">아직 수집된 항목이 없습니다. 위에서 URL을 수집해 보세요.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">상태</th>
                      <th className="px-4 py-2 font-medium">제목 / 메모</th>
                      <th className="px-4 py-2 font-medium">작성자</th>
                      <th className="px-4 py-2 font-medium">날짜</th>
                      <th className="px-4 py-2 text-right font-medium">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it) => (
                      <tr key={it.pageId} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3">
                          {badge(it.status)}
                          {it.category && (
                            <div className="mt-1 text-xs text-slate-500">{it.category}</div>
                          )}
                        </td>
                        <td className="max-w-md px-4 py-3">
                          <div className="font-medium">
                            {it.title || "(제목 없음)"}
                            {it.tags.length > 0 && (
                              <span className="ml-1.5 text-xs font-normal text-slate-400">#{it.tags.join(" #")}</span>
                            )}
                          </div>
                          {it.summary && <div className="line-clamp-2 text-xs text-slate-500">{it.summary}</div>}
                          {it.note && <div className="mt-1 text-xs text-rose-600">{it.note}</div>}
                          {it.sourceUrl && (
                            <a
                              href={it.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 block truncate text-xs text-indigo-600 hover:underline"
                            >
                              {it.sourceUrl}
                            </a>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{it.author || "-"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {it.sourceDate ? formatKst(it.sourceDate).slice(0, 11) : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1">
                            {it.status !== "PUBLISHED" && (
                              <>
                                {(it.status === "SUMMARIZED" || it.status === "READY") && (
                                  <form action={publishAction}>
                                    <input type="hidden" name="pageId" value={it.pageId} />
                                    <SubmitButton pendingText="게시 중…">게시</SubmitButton>
                                  </form>
                                )}
                                <form action={retryAction}>
                                  <input type="hidden" name="pageId" value={it.pageId} />
                                  <SubmitButton variant="secondary" pendingText="처리 중…">
                                    다시 처리
                                  </SubmitButton>
                                </form>
                                <form action={ignoreAction}>
                                  <input type="hidden" name="pageId" value={it.pageId} />
                                  <SubmitButton variant="ghost">제외</SubmitButton>
                                </form>
                              </>
                            )}
                            {it.notionUrl && (
                              <a
                                href={it.notionUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                              >
                                Notion ↗
                              </a>
                            )}
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

        {/* 사이드: 설정 + 계정 */}
        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold">⚙️ X 수집 설정</h2>
            <form action={saveXSettingsAction} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Notion DB ID</label>
                <input
                  name="notionDatabaseId"
                  defaultValue={cfg.notionDatabaseId}
                  className={input}
                  placeholder="32자리 (Notion DB URL 끝부분)"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">RSSHub 주소 (선택)</label>
                <input
                  name="rsshubBase"
                  defaultValue={cfg.rsshubBase}
                  className={input}
                  placeholder="https://rsshub.example.com"
                />
                <p className="mt-1 text-xs text-slate-500">
                  설정하면 관제 계정의 피드를 <code>/twitter/user/핸들</code> 경로로 자동 생성합니다. 개별 피드 URL은 계정마다 따로
                  지정할 수도 있습니다.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">최대 게시물 나이 (일)</label>
                <input
                  type="number"
                  name="maxAgeDays"
                  min={1}
                  max={365}
                  defaultValue={cfg.maxAgeDays}
                  className={input}
                />
                <p className="mt-1 text-xs text-slate-500">이보다 오래된 게시물은 자동으로 제외됩니다.</p>
              </div>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} className="h-4 w-4" />
                  파이프라인 사용 (cron 자동 처리)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="autoPublish" defaultChecked={cfg.autoPublish} className="h-4 w-4" />
                  요약 후 자동 게시
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="emailOnPublish" defaultChecked={cfg.emailOnPublish} className="h-4 w-4" />
                  게시 시 뉴스레터 대기열에 추가
                </label>
              </div>
              <div className="flex justify-end">
                <SubmitButton>설정 저장</SubmitButton>
              </div>
            </form>

            {!cfg.notionDatabaseId && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-xs text-slate-600">
                  Notion DB가 아직 없나요? 부모 페이지 링크를 넣고 버튼을 누르면 필요한 속성까지 한 번에 만들어 줍니다. (부모
                  페이지를 인테그레이션에 공유해야 합니다)
                </p>
                <form action={createNotionDbAction} className="mt-2 flex gap-2">
                  <input name="parentPageId" className={input} placeholder="Notion 부모 페이지 링크 또는 ID" />
                  <SubmitButton variant="secondary" pendingText="생성 중…">
                    자동 생성
                  </SubmitButton>
                </form>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold">👤 관제 계정</h2>
            <p className="mt-1 text-xs text-slate-500">
              특정 X 계정을 RSS 피드로 감시합니다. 무료 브릿지(RSSHub 등)는 불안정할 수 있어, 실패해도 수동 URL 수집은 그대로
              동작합니다.
            </p>
            <form action={addAccountAction} className="mt-3 space-y-2">
              <input name="handle" className={input} placeholder="핸들 (예: elonmusk)" />
              <input name="feedUrl" className={input} placeholder="개별 피드 URL (선택 — RSSHub 미사용 시)" />
              <div className="flex justify-end">
                <SubmitButton variant="secondary">추가</SubmitButton>
              </div>
            </form>
            {accounts.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">등록된 계정이 없습니다.</p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {accounts.map((a) => (
                  <li key={a.id} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          @{a.handle}{" "}
                          <span className={`text-xs font-normal ${a.enabled ? "text-emerald-600" : "text-slate-400"}`}>
                            {a.enabled ? "감시 중" : "중지됨"}
                          </span>
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {a.feedUrl || `${cfg.rsshubBase || "(RSSHub 미설정)"}/twitter/user/${a.handle}`}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          확인: {formatKst(a.lastCheckedAt)}
                          {a.lastError && <span className="ml-1 text-rose-600">· {a.lastError}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        <form action={checkAccountAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <SubmitButton variant="ghost" pendingText="…">
                            확인
                          </SubmitButton>
                        </form>
                        <form action={toggleAccountAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <SubmitButton variant="ghost">{a.enabled ? "중지" : "시작"}</SubmitButton>
                        </form>
                        <form action={deleteAccountAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <SubmitButton variant="danger" confirm={`@${a.handle} 계정을 삭제할까요?`}>
                            삭제
                          </SubmitButton>
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
