"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import site from "../../config/site.json";

const LINKS = [
  { href: "/leads", label: "Leads" },
  { href: "/gaps", label: "Gaps" },
  { href: "/cost", label: "Cost" },
  { href: "/method", label: "Method" },
  { href: "/about", label: "About" },
];

export function Wordmark() {
  return (
    <Link href="/" className="text-ink shrink-0 font-display text-[16px] sm:text-[17px] tracking-[-0.01em] font-medium" aria-label={`${site.name} home`}>
      {site.name}
    </Link>
  );
}

export function Nav() {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/") || (href === "/leads" && path.startsWith("/companies"));

  return (
    <header className="sticky top-0 z-40 bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur border-b border-line">
      <div className="mx-auto max-w-[1200px] min-h-16 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
        <Wordmark />
        <nav className="flex items-center gap-5 sm:gap-6 sm:ml-auto" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}
              className={`mono !text-[14px] !font-semibold py-1 border-b-2 ${active(l.href) ? "text-ink border-ink" : "text-body border-transparent hover:text-ink"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
