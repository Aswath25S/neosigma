"use client";

import { useEffect, useId, useRef, useState } from "react";

// Dropdown that always opens below its button (native selects on macOS open
// on top of the chosen option). Keyboard: arrows, Enter, Escape, Home/End.
export function Select({ label, value, options, onChange, allLabel, hideLabel = false, className = "", size = "md" }: {
  label: string;
  value: string;
  options: [string, string][]; // [value, label]
  onChange: (v: string) => void;
  allLabel?: string; // adds a first "" option, e.g. "All segments"
  hideLabel?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const all: [string, string][] = allLabel ? [["", allLabel], ...options] : options;
  const current = all.find(([v]) => v === value)?.[1] ?? allLabel ?? value;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openList = () => {
    setActive(Math.max(0, all.findIndex(([v]) => v === value)));
    setOpen(true);
  };
  const choose = (i: number) => {
    onChange(all[i][0]);
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); openList(); return; }
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(all.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(all.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className={`relative flex min-w-0 flex-col gap-1.5 ${className}`} onClick={(e) => e.stopPropagation()}>
      {!hideLabel && <span className="label">{label}</span>}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${current}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
        className={`flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-[10px] border bg-surface-2 pl-3.5 pr-3 text-left transition-colors duration-150 ${size === "sm" ? "h-9 text-[13px]" : "h-10 text-[14px]"} ${open ? "border-muted" : "border-line-strong hover:border-muted"} ${value ? "text-ink" : "text-body"}`}
      >
        <span className="truncate">{current}</span>
        <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 text-body transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        className={`absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 origin-top overflow-auto rounded-[10px] border border-line-strong bg-surface-2 p-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)] transition-[opacity,transform] duration-150 ${open ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1"}`}
        inert={!open}
      >
        {all.map(([v, l], i) => {
          const selected = v === value;
          return (
            <li
              key={v || "all"}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(i); }}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-[13.5px] ${i === active ? "bg-surface" : ""} ${selected ? "font-medium text-ink" : "text-body"}`}
            >
              <span className="truncate">{l}</span>
              {selected && (
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-covered">
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
