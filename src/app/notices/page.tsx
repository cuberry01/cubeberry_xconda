import type { Metadata } from "next";
import { getXcondaConfig } from "@/lib/xconda/config";
import { queryItems } from "@/lib/xconda/notion";
import { itemAnchor, type XItem } from "@/lib/xconda/types";
import { kstParts } from "@/lib/time";

// 공지(랜딩) 페이지 — Notion에서 PUBLISHED 항목을 읽어 보여준다.
// 60초 캐시(ISR). 게시 액션이 발생하면 revalidatePath로 즉시 갱신된다.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "공지",
  description: "X에서 수집한 AI 소식을 요약해 공지합니다.",
};

function dateLabel(d: Date | null) {
  if (!d) return "";
  const p = kstParts(d);
  return `${p.year}.${String(p.month).padStart(2, "0")}.${String(p.day).padStart(2, "0")}`;
}

const CATEGORY_BADGE: Record<string, string> = {
  "AI 모델": "bg-indigo-100 text-indigo-700",
  "AI 영상": "bg-fuchsia-100 text-fuchsia-700",
  "AI 이미지": "bg-sky-100 text-sky-700",
  "AI 도구": "bg-emerald-100 text-emerald-700",
  뉴스: "bg-amber-100 text-amber-700",
  기타: "bg-slate-100 text-slate-600",
};

function categoryBadge(category: string) {
  const cls = CATEGORY_BADGE[category] ?? "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{category}</span>;
}

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
        <h1 className="text-3xl font-bold">📢 공지</h1>
        <p className="mt-2 text-sm text-slate-500">X에서 수집한 소식을 요약해 공지합니다.</p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          아직 게시된 공지가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((it) => (
            <article
              key={it.pageId}
              id={itemAnchor(it.pageId)}
              className="scroll-mt-24 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {it.category && categoryBadge(it.category)}
                {it.sourceDate && <span>{dateLabel(it.sourceDate)}</span>}
                {it.author && <span>· {it.author}</span>}
              </div>
              <h2 className="text-lg font-bold leading-snug">{it.title || "(제목 없음)"}</h2>
              {it.announcement && <p className="mt-2 text-sm leading-relaxed text-slate-700">{it.announcement}</p>}
              {it.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.imageUrl} alt="" loading="lazy" className="mt-3 max-h-96 w-full rounded-xl object-cover" />
              )}
              {it.summary && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-indigo-600">요약 보기</summary>
                  <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-600">{it.summary}</p>
                </details>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {it.tags.map((t) => (
                  <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    #{t}
                  </span>
                ))}
                {it.sourceUrl && (
                  <a
                    href={it.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-xs font-medium text-indigo-600 hover:underline"
                  >
                    원문 보기 ↗
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
