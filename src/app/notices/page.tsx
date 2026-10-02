import { IconChevronDown, IconExternal, IconMegaphone } from "@/components/icons";
import { Badge, EmptyState } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { kstParts } from "@/lib/time";
import { getXcondaConfig } from "@/lib/xconda/config";
import { queryItems } from "@/lib/xconda/notion";
import { itemAnchor, type XItem } from "@/lib/xconda/types";
import type { Metadata } from "next";

// 공개 공지 페이지: 외부에서 자주 열리므로 Notion에서 PUBLISHED 항목을 읽어 보여준다.
// 60초 캐시(ISR). 게시 액션이 발생하면 revalidatePath로 즉시 갱신된다.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "공지",
  description: "X에서 수집한 AI 소식을 요약해 공지합니다.",
};

function dateLabel(d: Date | null) {
  if (!d) return { text: "", iso: "" };
  const p = kstParts(d);
  const iso = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return { text: iso.replace(/-/g, "."), iso };
}

const CATEGORY_TONE: Record<string, BadgeTone> = {
  "AI 모델": "accent",
  "AI 영상": "accent",
  "AI 이미지": "info",
  "AI 도구": "ok",
  뉴스: "warn",
};

export default async function NoticesPage() {
  let items: XItem[] = [];
  try {
    const cfg = await getXcondaConfig();
    if (cfg.notionToken && cfg.notionDatabaseId) {
      items = await queryItems(cfg, { status: "PUBLISHED", pageSize: 50 });
    }
  } catch {
    // Notion 미설정/일시 오류 시 빈 목록으로 렌더링 (공개 페이지라 에러를 노출하지 않음)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 text-center">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-emerald-300 ring-1 ring-inset ring-primary/25">
          <IconMegaphone className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">공지</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          X에서 수집한 AI 소식을 Gemini로 요약해 공지합니다.
          {items.length > 0 && <span className="ml-1 font-mono text-xs text-faint">총 {items.length}건</span>}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-line/80 bg-surface p-6">
          <EmptyState
            icon={<IconMegaphone className="h-5 w-5" />}
            title="아직 게시된 공지가 없습니다"
            description="대시보드에서 X 게시물을 수집하고 게시하면 이곳에 순서대로 쌓입니다."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((it) => {
            const date = dateLabel(it.sourceDate);
            return (
              <article
                key={it.pageId}
                id={itemAnchor(it.pageId)}
                className="scroll-mt-24 rounded-2xl border border-line/80 bg-surface p-5 shadow-[0_24px_50px_-42px_rgba(0,0,0,0.95)] sm:p-6"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {it.category && <Badge tone={CATEGORY_TONE[it.category] ?? "neutral"}>{it.category}</Badge>}
                  {date.text && (
                    <time dateTime={date.iso} className="font-mono">
                      {date.text}
                    </time>
                  )}
                  {it.author && <span>· {it.author}</span>}
                </div>

                <h2 className="text-lg font-bold leading-snug text-ink">{it.title || "(제목 없음)"}</h2>

                {it.announcement && (
                  <p className="mt-2.5 text-sm leading-7 text-ink-2">{it.announcement}</p>
                )}

                {it.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="mt-4 aspect-[16/9] max-h-96 w-full rounded-xl object-cover ring-1 ring-line/70"
                  />
                )}

                {it.summary && (
                  <details className="group mt-4 rounded-xl border border-line/70 bg-canvas/40">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-emerald-300 marker:content-none">
                      <IconChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
                      요약 보기
                    </summary>
                    <p className="whitespace-pre-line border-t border-line/70 px-4 py-3 text-sm leading-7 text-muted">
                      {it.summary}
                    </p>
                  </details>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {it.tags.map((t) => (
                    <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
                      #{t}
                    </span>
                  ))}
                  {it.sourceUrl && (
                    <a
                      href={it.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex min-h-11 items-center gap-1 text-xs font-medium text-emerald-300 hover:underline"
                    >
                      원문 보기
                      <IconExternal className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
