"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { IconHistory, IconInbox, IconMegaphone, IconSettings, IconUsers, type IconProps } from "./icons";

type NavGroup = "collect" | "newsletter" | "public";

type NavItem = { href: string; label: string; icon: ComponentType<IconProps>; group: NavGroup };

/* 화면 순서: 수집 → 뉴스레터 → 공개. 데스크톱에서는 그룹 사이에 구분선을 둡니다. */
const items: NavItem[] = [
  { href: "/", label: "X 수집", icon: IconInbox, group: "collect" },
  { href: "/subscribers", label: "구독자", icon: IconUsers, group: "newsletter" },
  { href: "/logs", label: "발송 기록", icon: IconHistory, group: "newsletter" },
  { href: "/settings", label: "설정", icon: IconSettings, group: "newsletter" },
  { href: "/notices", label: "공지", icon: IconMegaphone, group: "public" },
];

const GROUP_ORDER: NavGroup[] = ["collect", "newsletter", "public"];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" || path.startsWith("/xconda") : path.startsWith(href);
}

/** 현재 경로가 속한 메뉴 항목 (모바일 헤더의 현재 위치 표시에 사용) */
export function currentNavItem(path: string): NavItem | undefined {
  return items.find((it) => isActive(path, it.href));
}

/** 데스크톱(≥640px) 상단 내비게이션 — 그룹 구분선 포함 */
export function DesktopNav() {
  const path = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="hidden items-center gap-1 sm:flex">
      {GROUP_ORDER.map((group, gi) => {
        const groupItems = items.filter((it) => it.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div
            key={group}
            className={`flex items-center gap-1 ${gi > 0 ? "ml-1 border-l border-line/70 pl-2" : ""}`}
          >
            {groupItems.map((it) => {
              const active = isActive(path, it.href);
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors duration-150 ${
                    active
                      ? "bg-primary/10 text-emerald-300 ring-1 ring-primary/25"
                      : "text-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {it.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/** 레거시 레이아웃(extracted/, sheet-mailer/) 호환용 별칭 */
export const Nav = DesktopNav;

/** 모바일(<640px) 하단 탭 — 엄지 도달 범위와 44px 터치 타깃 확보 */
export function MobileNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {items.map((it) => {
          const active = isActive(path, it.href);
          const Icon = it.icon;
          return (
            <li key={it.href} className="min-w-0 flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className="relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-4 top-0 h-0.5 rounded-full ${active ? "bg-primary" : "bg-transparent"}`}
                />
                <span
                  className={`grid h-6 w-10 place-items-center rounded-full transition-colors duration-150 ${
                    active ? "bg-primary/15 text-emerald-300" : "text-muted"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className={`truncate px-1 transition-colors duration-150 ${active ? "text-emerald-300" : "text-muted"}`}>
                  {it.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
