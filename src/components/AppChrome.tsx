"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Nav } from "./Nav";

export function AppChrome({ children }: { children: ReactNode }) {
  const path = usePathname();

  // The root route is the public Google Vids-style marketing page. Keep the
  // existing newsletter console chrome on the internal routes.
  if (path === "/") return <>{children}</>;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">✉</span>
            시트 메일러
          </Link>
          <Nav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
