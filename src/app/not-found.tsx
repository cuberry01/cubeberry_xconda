import type { Metadata } from "next";
import { IconInbox, IconMegaphone, IconSearch } from "@/components/icons";
import { LinkButton, panelClass } from "@/components/ui";

export const metadata: Metadata = { title: "페이지를 찾을 수 없습니다" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl">
      <div className={`${panelClass} p-8 text-center`}>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted ring-1 ring-inset ring-line/80">
          <IconSearch className="h-6 w-6" />
        </span>
        <p className="mt-4 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-faint">404</p>
        <h1 className="mt-1.5 text-xl font-bold tracking-tight text-ink">페이지를 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          주소가 바뀌었거나 삭제된 항목일 수 있습니다. 아래에서 원하는 화면으로 이동하세요.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <LinkButton href="/" variant="primary">
            <IconInbox className="h-3.5 w-3.5" />
            X 수집
          </LinkButton>
          <LinkButton href="/notices">
            <IconMegaphone className="h-3.5 w-3.5" />
            공지 보기
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
