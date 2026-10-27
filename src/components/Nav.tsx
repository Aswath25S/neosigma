"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { RefreshButton } from "./RefreshButton";

const LINKS = [
  { href: "/leads", label: "Leads" },
  { href: "/gaps", label: "Gaps" },
  { href: "/cost", label: "Cost" },
  { href: "/method", label: "Method" },
];

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-ink shrink-0" aria-label="Eval Hiring Radar home">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="9.5" stroke="currentColor" strokeOpacity="0.5" />
        <circle cx="11" cy="11" r="5.5" stroke="currentColor" strokeOpacity="0.8" />
        <path d="M11 11 L19 6" stroke="var(--covered)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="11" cy="11" r="1.6" fill="currentColor" />
      </svg>
      <span className="font-display text-[17px] tracking-[-0.01em] font-normal">Eval Hiring Radar</span>
    </Link>
  );
}

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => path === href || path.startsWith(href + "/") || (href === "/leads" && path.startsWith("/companies"));

  return (
    <header className="sticky top-0 z-40 bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur border-b border-line">
      <div className="mx-auto max-w-[1200px] h-16 px-4 sm:px-6 flex items-center gap-8">
        <Wordmark />
        <nav className="hidden md:flex items-center gap-6" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`mono ${active(l.href) ? "text-ink" : "text-muted hover:text-ink"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden md:flex items-center gap-3">
          <Link href="/try" className={`mono mr-2 ${path === "/try" ? "text-ink" : "text-muted hover:text-ink"}`}>Try a posting</Link>
          <a href="/api/export/leads" className="btn btn-outline btn-sm">Export</a>
          <RefreshButton />
        </div>
        <button
          className="ml-auto md:hidden btn btn-secondary btn-sm"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="md:hidden border-t border-line px-4 py-4 flex flex-col gap-4 bg-bg fade-in">
          {[...LINKS, { href: "/try", label: "Try a posting" }].map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={`mono ${active(l.href) ? "text-ink" : "text-muted"}`}>
              {l.label}
            </Link>
          ))}
          <div className="flex gap-3 pt-2">
            <a href="/api/export/leads" className="btn btn-outline btn-sm">Export</a>
            <RefreshButton />
          </div>
        </div>
      )}
    </header>
  );
}
