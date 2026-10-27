"use client";

import { useEffect, useState } from "react";

export function BriefRail({ items, csvHref, readTime }: { items: { id: string; num: string; title: string }[]; csvHref: string; readTime: number }) {
  const [active, setActive] = useState(items[0]?.id);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [items]);

  return (
    <nav aria-label="In this brief" className="lg:sticky lg:top-24">
      <div className="label mb-4">In this brief</div>
      <ol className="flex flex-col">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`}
              className={`flex gap-3 py-1.5 pl-3 border-l text-[14px] ${active === i.id ? "border-ink text-ink" : "border-line text-muted hover:text-ink"}`}>
              <span className="secnum pt-0.5">{i.num}</span>
              <span>{i.title}</span>
            </a>
          </li>
        ))}
      </ol>
      <div className="label mt-8 mb-3">Share</div>
      <div className="flex gap-2">
        <button className="btn btn-secondary btn-sm" onClick={async () => {
          await navigator.clipboard.writeText(window.location.href.split("#")[0]);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}>{copied ? "Copied" : "Copy link"}</button>
        <a className="btn btn-secondary btn-sm" href={csvHref}>CSV</a>
      </div>
      <div className="label mt-8 mb-1">Read time</div>
      <div className="mono text-body">{readTime} min</div>
    </nav>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn btn-secondary btn-sm" onClick={async () => {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }}>{done ? "Copied" : label}</button>
  );
}
