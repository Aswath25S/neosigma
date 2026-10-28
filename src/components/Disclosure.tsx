"use client";

import { useState } from "react";
import { Collapse } from "./Collapse";

// A "Show N more" row that opens its content with the same smooth height
// transition as the Leads and Gaps dropdowns.
export function Disclosure({ show, hide, children, className = "" }: { show: string; hide: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-5 py-3 text-left text-[14px] text-ink hover:bg-surface-2 transition-colors">
        <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-3.5 w-3.5 text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {open ? hide : show}
      </button>
      <Collapse open={open}>{children}</Collapse>
    </div>
  );
}
