"use client";

import { useMemo, useState } from "react";
import { useHash } from "./useHash";
import { coverageMap } from "@/lib/config";
import { LABEL_NAMES, NC_KIND_NAMES } from "@/lib/format";

export interface EvDuty {
  idx: number;
  text: string;
  sourceSpan: string;
  spanStart: number | null;
  spanEnd: number | null;
  label: string;
  taskId: string | null;
  notCoveredKind: string | null;
  confidence: number;
  rationale: string;
}

export interface EvQuote {
  quote: string;
  kind: string;
  span_start: number;
  span_end: number;
}

interface Segment {
  start: number;
  end: number;
  duty: EvDuty | null;
  live: number | null;
}

function taskName(id: string | null): string {
  const t = coverageMap.tasks.find((x) => x.id === id);
  return t ? `${t.id} · ${t.does}` : "";
}

// Splits the text at every span boundary; each piece knows which duty and
// which live-agent quote (if any) covers it.
function segments(text: string, duties: EvDuty[], quotes: EvQuote[]): Segment[] {
  const located = duties.filter((d) => d.spanStart != null && d.spanEnd != null);
  const cuts = new Set<number>([0, text.length]);
  for (const d of located) { cuts.add(d.spanStart!); cuts.add(d.spanEnd!); }
  for (const q of quotes) { cuts.add(q.span_start); cuts.add(q.span_end); }
  const points = [...cuts].filter((c) => c >= 0 && c <= text.length).sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i];
    const e = points[i + 1];
    if (e <= s) continue;
    const duty = located.find((d) => d.spanStart! <= s && d.spanEnd! >= e) ?? null;
    const live = quotes.findIndex((q) => q.span_start <= s && q.span_end >= e);
    out.push({ start: s, end: e, duty, live: live >= 0 ? live : null });
  }
  return out;
}

export function PostingEvidence({ text, duties, quotes }: { text: string; duties: EvDuty[]; quotes: EvQuote[] }) {
  const [picked, setActive] = useState<number | null>(null);
  const hash = useHash();
  const hashDuty = hash.match(/^#d(\d+)$/);
  const active = picked ?? (hashDuty ? Number(hashDuty[1]) : null);
  const [hover, setHover] = useState<{ duty: EvDuty; x: number; y: number } | null>(null);
  const segs = useMemo(() => segments(text, duties, quotes), [text, duties, quotes]);

  function focusDuty(idx: number, from: "text" | "panel") {
    setActive(idx);
    const target = document.getElementById(from === "text" ? `d${idx}` : `span-d${idx}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    history.replaceState(null, "", `#d${idx}`);
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-8 lg:gap-10">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-x-5 gap-y-2 mb-5">
          {(["covered", "assisted", "not_covered"] as const).map((l) => (
            <span key={l} className="mono !text-[11px] text-muted inline-flex items-center gap-2">
              <span className={`hl hl-${l} inline-block w-5 h-3`} /> {LABEL_NAMES[l]}
            </span>
          ))}
          <span className="mono !text-[11px] text-muted inline-flex items-center gap-2">
            <span className="live-underline text-ink">abc</span> Live-agent quote
          </span>
        </div>
        <div className="rounded-[14px] border border-line bg-surface/40 p-5 sm:p-7 text-[15.5px] leading-[1.75] text-body whitespace-pre-wrap break-words">
          {segs.map((s, i) => {
            const piece = text.slice(s.start, s.end);
            const liveCls = s.live != null ? "live-underline text-ink" : "";
            const firstOfLive = s.live != null && quotes[s.live].span_start === s.start;
            const liveId = firstOfLive ? `e${s.live}` : undefined;
            if (!s.duty) return liveCls ? <span key={i} id={liveId} className={`${liveCls} scroll-mt-24`}>{piece}</span> : <span key={i}>{piece}</span>;
            const d = s.duty;
            const first = d.spanStart === s.start;
            return (
              <span
                key={i}
                id={first ? `span-d${d.idx}` : undefined}
                className={`hl hl-${d.label} ${active === d.idx ? "hl-active" : ""} ${liveCls} scroll-mt-24`}
                onMouseEnter={(e) => setHover({ duty: d, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ duty: d, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
                onClick={() => focusDuty(d.idx, "text")}
              >
                {liveId ? <span id={liveId} className="scroll-mt-24" /> : null}
                {piece}
              </span>
            );
          })}
        </div>
        {hover && (
          <div
            role="tooltip"
            className="fixed z-50 max-w-[320px] rounded-[10px] border border-line-strong bg-surface-2 p-3 text-[13px] leading-snug shadow-xl pointer-events-none fade-in"
            style={{ left: Math.min(hover.x + 14, window.innerWidth - 340), top: hover.y + 16 }}
          >
            <div className="label mb-1" style={{ color: `var(--${hover.duty.label === "not_covered" ? "text-muted" : hover.duty.label})` }}>
              {LABEL_NAMES[hover.duty.label]}{hover.duty.taskId ? ` · ${hover.duty.taskId}` : hover.duty.notCoveredKind ? ` · ${NC_KIND_NAMES[hover.duty.notCoveredKind]}` : ""}
            </div>
            {hover.duty.taskId && <div className="text-ink mb-1">{taskName(hover.duty.taskId)}</div>}
            <div className="text-body">{hover.duty.rationale}</div>
          </div>
        )}
      </div>

      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
        <div className="label mb-3">Duties ({duties.length})</div>
        <ol className="flex flex-col gap-2.5">
          {duties.map((d) => (
            <li key={d.idx} id={`d${d.idx}`} className="scroll-mt-24">
              <button
                onClick={() => focusDuty(d.idx, "panel")}
                onMouseEnter={() => setActive(d.idx)}
                className={`w-full text-left rounded-[12px] border p-3.5 transition-colors ${active === d.idx ? "border-line-strong bg-surface" : "border-line hover:bg-surface"}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `var(--${d.label === "not_covered" ? "not-covered" : d.label})` }} />
                  <span className="mono !text-[11px] text-ink">{LABEL_NAMES[d.label]}</span>
                  <span className="mono !text-[11px] text-muted">
                    {d.taskId ?? (d.notCoveredKind ? NC_KIND_NAMES[d.notCoveredKind] : "")}
                  </span>
                  <span className="ml-auto mono !text-[11px] text-muted" title="Confidence">{Math.round(d.confidence * 100)}%</span>
                </div>
                <div className="text-[14px] text-ink leading-snug">{d.text}</div>
                <div className="text-[13px] text-muted mt-1 leading-snug">{d.rationale}</div>
                {d.spanStart == null && (
                  <div className="mono !text-[11px] text-assisted mt-1.5">Span not found verbatim; not highlighted.</div>
                )}
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
