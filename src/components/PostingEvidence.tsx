"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { coverageMap } from "@/lib/config";
import { NC_KIND_NAMES } from "@/lib/format";
import { useHash } from "./useHash";
import { LabelChip } from "./ui";
import type { ReportData } from "./PostingReport";

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
  gapTheme?: { id: number; name: string } | null;
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

const ATS_NAMES: Record<string, string> = {
  greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", workable: "Workable", smartrecruiters: "SmartRecruiters", workday: "Workday",
};

export function PostingEvidence({ data, ats }: { data: ReportData; ats?: string }) {
  const { text, duties, quotes } = data;
  const [picked, setPicked] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const hash = useHash();
  const hashDuty = hash.match(/^#d(\d+)$/);
  const selected = picked ?? (hashDuty ? Number(hashDuty[1]) : null);
  const segs = useMemo(() => segments(text, duties, quotes), [text, duties, quotes]);
  const activeIdx = hover ?? selected;
  const active = activeIdx != null ? duties.find((d) => d.idx === activeIdx) ?? null : null;

  // Phones: the side panel sits below the posting, so a tapped duty opens a
  // bottom sheet instead. The sheet keeps its content while it slides away.
  const [sheet, setSheet] = useState<number | null>(null);
  const [lastSheet, setLastSheet] = useState<number | null>(null);
  if (sheet !== null && sheet !== lastSheet) setLastSheet(sheet);
  const sheetDuty = lastSheet != null ? duties.find((d) => d.idx === lastSheet) ?? null : null;
  const narrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

  function pick(idx: number) {
    setPicked(idx);
    if (narrow()) setSheet(idx);
    history.replaceState(null, "", `#d${idx}`);
  }
  function focus(idx: number) {
    pick(idx);
    document.getElementById(`span-d${idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const order: Record<string, number> = { covered: 0, assisted: 1, not_covered: 2 };
  const list = [...duties].sort((a, b) => (order[a.label] ?? 3) - (order[b.label] ?? 3) || a.idx - b.idx);
  const f = data.fields;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Original text */}
      <div className="min-w-0 rounded-[14px] border border-line bg-surface p-5 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="label">Original posting<span className="lg:hidden"> · tap a highlight</span></span>
          {data.url && <a href={data.url} target="_blank" rel="noreferrer" className="text-[13px] text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink">View on {ATS_NAMES[ats ?? ""] ?? "source"} ↗</a>}
        </div>
        <div className="whitespace-pre-wrap break-words text-[15.5px] leading-[1.8] text-body">
          {segs.map((s, i) => {
            const piece = text.slice(s.start, s.end);
            const liveCls = s.live != null ? "live-underline text-ink" : "";
            const liveId = s.live != null && quotes[s.live].span_start === s.start ? `e${s.live}` : undefined;
            if (!s.duty) return liveCls ? <span key={i} id={liveId} className={`${liveCls} scroll-mt-24`}>{piece}</span> : <span key={i}>{piece}</span>;
            const d = s.duty;
            return (
              <span
                key={i}
                id={d.spanStart === s.start ? `span-d${d.idx}` : undefined}
                className={`hl hl-${d.label} ${activeIdx === d.idx ? "hl-active" : ""} ${liveCls} scroll-mt-24`}
                onMouseEnter={() => setHover(d.idx)}
                onMouseLeave={() => setHover(null)}
                onClick={() => pick(d.idx)}
              >
                {liveId ? <span id={liveId} className="scroll-mt-24" /> : null}
                {piece}
              </span>
            );
          })}
        </div>
      </div>

      {/* Side panel */}
      <aside className="flex flex-col gap-4 [&>*]:shrink-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
        <div className="rounded-[14px] border border-line bg-surface-2 px-5 py-3.5">
          <span className="label">Role</span>
          <p className="text-[15px] font-medium leading-snug text-ink">{data.title}</p>
          <span className="label mt-2 block">Company</span>
          <p className="text-[15px] leading-snug">{data.companySlug ? <Link href={`/companies/${data.companySlug}`} className="text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink">{data.company}</Link> : <span className="text-ink">{data.company}</span>}</p>
        </div>

        <div className="rounded-[14px] border border-line bg-surface p-5 lg:min-h-[260px]">
          {active ? <DutyDetail d={active} /> : (
            <p className="text-[14px] text-muted">Hover over a highlight in the posting, or click a duty in the list below, to see its label, task and rationale.</p>
          )}
        </div>

        <div className="rounded-[14px] border border-line bg-surface p-2">
          <div className="px-3 pb-1 pt-2"><span className="label">{duties.length} duties</span></div>
          <ul>
            {list.map((d) => (
              <li key={d.idx} id={`d${d.idx}`} className="scroll-mt-24">
                <button onClick={() => focus(d.idx)}
                  className={`flex w-full items-start gap-2.5 rounded-[8px] border-l-[3px] px-3 py-2 text-left text-[13.5px] transition-colors ${selected === d.idx ? "border-ink bg-surface-2 text-ink" : "border-transparent text-body hover:bg-surface-2"}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${d.label === "covered" ? "bg-covered" : d.label === "assisted" ? "bg-assisted" : "border border-muted"}`} />
                  <span className="min-w-0 flex-1">
                    {d.text}
                    {d.taskId && <span className="ml-1.5 font-mono text-[11px] text-muted">{d.taskId}</span>}
                    {d.spanStart == null && <span className="ml-1 text-[11px] text-assisted">(span not found)</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[14px] border border-line bg-surface p-5 text-[13.5px]">
          <span className="label">Extracted fields</span>
          <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-muted">Seniority</dt><dd className="text-body">{f.seniority ?? "—"}</dd>
            <dt className="text-muted">Locations</dt><dd className="text-body">{data.locations.join("; ") || f.location || "—"}{f.remote ? " · remote" : ""}</dd>
            <dt className="text-muted">Agent type</dt><dd className="text-body">{f.agentType ?? "—"}</dd>
            <dt className="text-muted">Tools</dt><dd className="text-body">{f.tools.join(", ") || "None named"}</dd>
            <dt className="text-muted">Volume</dt><dd className="text-body">{f.volumeHint ?? "—"}</dd>
            <dt className="text-muted">First eval hire</dt><dd className="text-body">{f.firstEvalHire.value ? `Yes · “${f.firstEvalHire.quote}”` : "No"}</dd>
            {data.postedAt !== undefined && <><dt className="text-muted">Posted</dt><dd className="text-body">{data.postedAt ? new Date(data.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown"}</dd></>}
          </dl>
          {f.pain.length > 0 && (
            <div className="mt-4">
              <span className="label">Pain phrases</span>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {f.pain.map((x) => <li key={x} className="rounded-full border border-[color-mix(in_srgb,var(--assisted)_40%,transparent)] bg-[color-mix(in_srgb,var(--assisted)_12%,transparent)] px-2.5 py-0.5 text-[12.5px] text-assisted">{x}</li>)}
              </ul>
            </div>
          )}
        </div>
      </aside>

      {/* Bottom sheet for phones */}
      <div role="dialog" aria-label="Duty details" aria-hidden={sheet === null} inert={sheet === null}
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[62vh] overflow-y-auto rounded-t-2xl border-t border-line-strong bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out lg:hidden ${sheet !== null ? "translate-y-0" : "translate-y-full"}`}>
        <div className="mb-2 flex justify-center"><span className="h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" /></div>
        <button onClick={() => setSheet(null)} className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-line-strong text-body" aria-label="Close duty details">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        <div className="pr-10">{sheetDuty && <DutyDetail d={sheetDuty} />}</div>
      </div>
    </div>
  );
}

function DutyDetail({ d }: { d: EvDuty }) {
  const task = coverageMap.tasks.find((t) => t.id === d.taskId);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <LabelChip label={d.label} kind={d.notCoveredKind} />
        <span className="label">Confidence {d.confidence.toFixed(2)}</span>
      </div>
      <p className="h-card !text-[17px]">{d.text}</p>
      {task && (
        <div>
          <span className="label">NeoSigma task</span>
          <p className="mt-1 text-[14px] text-body"><span className="font-mono text-[12px] text-covered">{task.id}</span> · {task.does}</p>
        </div>
      )}
      {d.label === "not_covered" && d.notCoveredKind && (
        <div>
          <span className="label">Why it is not covered</span>
          <p className="mt-1 text-[14px] text-body">{NC_KIND_NAMES[d.notCoveredKind]}</p>
        </div>
      )}
      <div>
        <span className="label">Rationale</span>
        <p className="mt-1 text-[14px] text-body">{d.rationale}</p>
      </div>
      {d.gapTheme && <p className="text-[13px] text-body">Gap theme: <Link href={`/gaps#g${d.gapTheme.id}`} className="text-ink underline underline-offset-4 decoration-line-strong">{d.gapTheme.name}</Link></p>}
      <div>
        <span className="label">Source span</span>
        <p className="mt-1 text-[13px] italic text-body">“{d.sourceSpan}”</p>
      </div>
    </div>
  );
}
