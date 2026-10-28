"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DEFAULT_WEIGHTS, scoreCompany, TRIGGER_NAMES, LIVE_STRENGTH_TEXT, type Weights } from "@/lib/scoring";
import { SEGMENTS, segmentName } from "@/lib/config";
import { money, pct, shortDate } from "@/lib/format";
import { TierChip } from "@/components/ui";
import type { LeadRow } from "@/lib/data";
import { downloadCsv } from "@/lib/csv";
import { Collapse } from "@/components/Collapse";
import { TASK_IDS, taskShort } from "@/lib/config";

interface RejectedRow {
  id: string; title: string; company: string; companySlug: string; reason: string; reasonText: string;
  detail: string | null; overlap: number | null; extracted: boolean;
}

const TABS = ["all", "hot", "warm", "watch", "rejected"] as const;
type Tab = (typeof TABS)[number];
const PARTS = [
  { key: "overlap", label: "Overlap" },
  { key: "live_agent", label: "Live-agent strength" },
  { key: "fit", label: "Fit" },
  { key: "timing", label: "Timing" },
] as const;
type PartKey = (typeof PARTS)[number]["key"];
const SORTS = ["score", "overlap", "live", "cost", "name"] as const;
type SortKey = (typeof SORTS)[number];
const AGENT_TYPES = ["support", "voice", "coding", "research", "sales", "healthcare", "legal", "finance", "internal", "other"];

function parseWeights(s: string | undefined): Record<PartKey, number> {
  const d = DEFAULT_WEIGHTS.parts;
  const parts = (s ?? "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0)) return { ...d };
  return { overlap: parts[0], live_agent: parts[1], fit: parts[2], timing: parts[3] };
}

export function LeadsView({ leads, rejected, initial }: { leads: LeadRow[]; rejected: RejectedRow[]; initial: Record<string, string> }) {
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(initial.tab) ? (initial.tab as Tab) : "all");
  const [segment, setSegment] = useState(initial.segment ?? "");
  const [agentType, setAgentType] = useState(initial.agent ?? "");
  const [hasSalary, setHasSalary] = useState(initial.salary === "1");
  const [trigger, setTrigger] = useState(initial.trigger ?? "");
  const [reason, setReason] = useState(initial.reason ?? "");
  const [sort, setSort] = useState<SortKey>((SORTS as readonly string[]).includes(initial.sort) ? (initial.sort as SortKey) : "score");
  const [dir, setDir] = useState<"asc" | "desc">(initial.dir === "asc" ? "asc" : "desc");
  const [parts, setParts] = useState(parseWeights(initial.w));
  const [open, setOpen] = useState<number | null>(null);
  const [panel, setPanel] = useState(false);

  const isDefault = PARTS.every((p) => parts[p.key] === DEFAULT_WEIGHTS.parts[p.key]);

  // Filter and sort state lives in the URL so a view can be shared.
  useEffect(() => {
    const q = new URLSearchParams();
    if (tab !== "all") q.set("tab", tab);
    if (segment) q.set("segment", segment);
    if (agentType) q.set("agent", agentType);
    if (hasSalary) q.set("salary", "1");
    if (trigger) q.set("trigger", trigger);
    if (reason) q.set("reason", reason);
    if (sort !== "score") q.set("sort", sort);
    if (dir !== "desc") q.set("dir", dir);
    if (!isDefault) q.set("w", PARTS.map((p) => parts[p.key]).join(","));
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [tab, segment, agentType, hasSalary, trigger, reason, sort, dir, parts, isDefault]);

  const scored = useMemo(() => {
    const w: Weights = { ...DEFAULT_WEIGHTS, parts };
    const now = new Date();
    const rows = leads.map((l) => {
      const b = scoreCompany({ segment: l.segment, employeeBand: l.employeeBand, postings: l.postings, triggers: l.triggers }, w, now);
      return { ...l, b };
    });
    return rows;
  }, [leads, parts]);

  const rows = useMemo(() => {
    let r = scored.filter((l) => tab === "all" || tab === "rejected" || l.b.tier.toLowerCase() === tab);
    if (segment) r = r.filter((l) => l.segment === segment);
    if (agentType) r = r.filter((l) => l.postings.some((p) => p.agentType === agentType));
    if (hasSalary) r = r.filter((l) => l.postings.some((p) => p.hasSalary));
    if (trigger) r = r.filter((l) => l.b.timing.active.some((t) => t.kind === trigger));
    const val = (l: (typeof r)[number]): number | string => {
      switch (sort) {
        case "overlap": return l.b.overlap.bestOverlap;
        case "live": return l.b.live.strength;
        case "cost": return l.cost ?? -1;
        case "name": return l.name.toLowerCase();
        default: return l.b.total;
      }
    };
    return [...r].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return dir === "asc" ? c : -c;
    });
  }, [scored, tab, segment, agentType, hasSalary, trigger, sort, dir]);

  const rejectedRows = useMemo(() => rejected.filter((r) => !reason || r.reason === reason), [rejected, reason]);
  const reasons = useMemo(() => {
    const m = new Map<string, { text: string; n: number }>();
    for (const r of rejected) m.set(r.reason, { text: r.reasonText, n: (m.get(r.reason)?.n ?? 0) + 1 });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [rejected]);

  const counts = useMemo(() => ({
    all: scored.length,
    hot: scored.filter((l) => l.b.tier === "Hot").length,
    warm: scored.filter((l) => l.b.tier === "Warm").length,
    watch: scored.filter((l) => l.b.tier === "Watch").length,
    rejected: rejected.length,
  }), [scored, rejected]);

  function sortBy(k: SortKey) {
    if (sort === k) setDir(dir === "desc" ? "asc" : "desc");
    else { setSort(k); setDir(k === "name" ? "asc" : "desc"); }
  }

  function exportCsv() {
    if (tab === "rejected") {
      downloadCsv("rejected-postings.csv", ["company", "title", "fail_reason", "detail", "posting_url"],
        rejectedRows.map((r) => [r.company, r.title, r.reasonText, r.detail ?? "", `${location.origin}/postings/${r.id}`]));
      return;
    }
    downloadCsv("leads.csv",
      ["company", "segment", "tier", "lead_score", "overlap_pct", "live_agent_strength", "fit_points", "timing_points", "top_trigger", "top_trigger_date", "manual_work_cost_usd", "qualifying_roles", "company_url"],
      rows.map((l) => [l.name, segmentName(l.segment), l.b.tier, Math.round(l.b.total), Math.round(l.b.overlap.bestOverlap * 100), l.b.live.strength,
        l.b.fit.points.toFixed(1), l.b.timing.points.toFixed(1), l.b.timing.topTrigger ? TRIGGER_NAMES[l.b.timing.topTrigger.kind] : "",
        l.b.timing.topTrigger?.date.slice(0, 10) ?? "", l.cost != null ? Math.round(l.cost) : "", l.postings.length, `${location.origin}/companies/${l.slug}`]));
  }

  const thProps = { sort, dir, onSort: sortBy };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-10">
      <div className="min-w-0">
        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line pb-3 mb-5" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`mono capitalize ${tab === t ? "text-ink" : "text-muted hover:text-ink"}`}>
              {t === "all" ? "Leads" : t} <span className="text-muted">{counts[t]}</span>
            </button>
          ))}
          <button className="ml-auto btn btn-outline btn-sm" onClick={exportCsv}>CSV</button>
          <button className="lg:hidden btn btn-secondary btn-sm" onClick={() => setPanel((p) => !p)}>{panel ? "Hide weights" : "Weights"}</button>
        </div>

        {/* Filters */}
        {tab !== "rejected" ? (
          <div className="flex flex-wrap gap-3 mb-6">
            <select className="h-9 px-3 text-[13px]" value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Segment">
              <option value="">All segments</option>
              {SEGMENTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="h-9 px-3 text-[13px]" value={agentType} onChange={(e) => setAgentType(e.target.value)} aria-label="Agent type">
              <option value="">All agent types</option>
              {AGENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="h-9 px-3 text-[13px]" value={trigger} onChange={(e) => setTrigger(e.target.value)} aria-label="Trigger type">
              <option value="">Any trigger</option>
              {Object.entries(TRIGGER_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="mono !text-[12px] text-body inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-line-strong bg-surface-2 cursor-pointer">
              <input type="checkbox" checked={hasSalary} onChange={(e) => setHasSalary(e.target.checked)} className="accent-[var(--covered)]" />
              Has salary
            </label>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 mb-6">
            <select className="h-9 px-3 text-[13px]" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Fail reason">
              <option value="">All fail reasons</option>
              {reasons.map(([k, v]) => <option key={k} value={k}>{v.text} ({v.n})</option>)}
            </select>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          {tab !== "rejected" ? (
            rows.length ? (
              <table className="table min-w-[860px]">
                <thead>
                  <tr>
                    <Th k="name" {...thProps}>Company</Th>
                    <Th {...thProps}>Segment</Th>
                    <Th {...thProps}>Tier</Th>
                    <Th k="score" className="text-right" {...thProps}>Score</Th>
                    <Th k="overlap" className="text-right" {...thProps}>Overlap</Th>
                    <Th k="live" className="text-right" {...thProps}>Live agent</Th>
                    <Th {...thProps}>Top trigger</Th>
                    <Th k="cost" className="text-right" {...thProps}>Manual work / yr</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <Fragment key={l.id}>
                      {/* Clicking a row opens its summary; links inside the row still navigate. */}
                      <tr onClick={() => setOpen(open === l.id ? null : l.id)} className={`cursor-pointer ${open === l.id ? "!bg-surface" : ""}`}>
                        <td>
                          <div className="flex items-start gap-2.5">
                            <button onClick={(e) => { e.stopPropagation(); setOpen(open === l.id ? null : l.id); }} aria-expanded={open === l.id}
                              aria-controls={`lead-${l.id}`} aria-label={`${open === l.id ? "Hide" : "Show"} summary for ${l.name}`}
                              className="mt-1 text-muted hover:text-ink">
                              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
                                className={`transition-transform duration-300 ${open === l.id ? "rotate-90" : ""}`}>
                                <path d="M4 2.5 L8 6 L4 9.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <div>
                              <Link href={`/companies/${l.slug}`} onClick={(e) => e.stopPropagation()} className="text-ink font-medium hover:underline underline-offset-4">{l.name}</Link>
                              <div className="mono !text-[11px] text-muted">{l.postings.length} role{l.postings.length > 1 ? "s" : ""}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-[14px]">{segmentName(l.segment)}</td>
                        <td><TierChip tier={l.b.tier} /></td>
                        <td className="text-right font-display text-[20px] text-ink">{Math.round(l.b.total)}</td>
                        <td className="text-right">
                          <Link href={`/postings/${l.b.overlap.bestPostingId}`} onClick={(e) => e.stopPropagation()} className="text-ink hover:underline underline-offset-4" title="Best posting">
                            {pct(l.b.overlap.bestOverlap)}
                          </Link>
                        </td>
                        <td className="text-right">
                          <Link href={`/postings/${l.b.live.postingId}#e0`} onClick={(e) => e.stopPropagation()} className="text-ink hover:underline underline-offset-4" title={LIVE_STRENGTH_TEXT[l.b.live.strength]}>
                            {l.b.live.strength}<span className="text-muted">/25</span>
                          </Link>
                        </td>
                        <td className="text-[14px]">
                          {l.b.timing.topTrigger ? (
                            <a href={l.b.timing.topTrigger.url ?? "#"} onClick={(e) => e.stopPropagation()} target={l.b.timing.topTrigger.url?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="hover:text-ink" title={l.b.timing.topTrigger.title}>
                              {TRIGGER_NAMES[l.b.timing.topTrigger.kind]} <span className="text-muted">· {shortDate(l.b.timing.topTrigger.date).replace(/, \d{4}$/, "")}</span>
                            </a>
                          ) : <span className="text-muted">None</span>}
                        </td>
                        <td className="text-right">
                          {l.cost != null ? (
                            <Link href={`/companies/${l.slug}#cost`} onClick={(e) => e.stopPropagation()} className="text-ink hover:underline underline-offset-4">{money(l.cost, { compact: true })}</Link>
                          ) : <span className="text-muted" title="No salary data for these roles">—</span>}
                        </td>
                      </tr>
                      <tr className="lead-detail" id={`lead-${l.id}`}>
                        <td colSpan={8} className={`!p-0 !h-auto ${open === l.id ? "" : "!border-b-0"}`}>
                          <Collapse open={open === l.id}>
                            <LeadSummary l={l} />
                          </Collapse>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-muted py-10">No leads match these filters{leads.length ? "" : ". Run the pipeline (npm run all) to collect data"}.</p>
            )
          ) : (
            <table className="table min-w-[760px]">
              <thead><tr><th>Company</th><th>Role</th><th>Fail reason</th><th>Detail</th></tr></thead>
              <tbody>
                {rejectedRows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-[14px]"><Link href={`/companies/${r.companySlug}`} className="text-ink hover:underline">{r.company}</Link></td>
                    <td className="text-[14px]"><Link href={`/postings/${r.id}`} className="hover:text-ink underline decoration-line-strong underline-offset-4">{r.title}</Link></td>
                    <td className="text-[14px] text-ink">{r.reasonText}</td>
                    <td className="text-[13px] text-muted">{r.detail ?? (r.extracted && r.overlap != null ? `Overlap ${pct(r.overlap)}` : "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Weights */}
      <aside className={`${panel ? "block" : "hidden"} lg:block`}>
        <div className="lg:sticky lg:top-24 rounded-[14px] border border-line bg-surface p-5 fade-in">
          <div className="flex items-center mb-4">
            <span className="label">Weights</span>
            <button onClick={() => setParts({ ...DEFAULT_WEIGHTS.parts })} className={`ml-auto mono !text-[11px] ${isDefault ? "text-muted" : "text-ink underline underline-offset-4"}`}>
              Reset to defaults
            </button>
          </div>
          {PARTS.map((p) => (
            <div key={p.key} className="mb-4">
              <div className="flex text-[13px] mb-1">
                <label htmlFor={`w-${p.key}`} className="text-body">{p.label}</label>
                <span className="ml-auto mono text-ink">{parts[p.key]}</span>
              </div>
              <input id={`w-${p.key}`} type="range" min={0} max={60} step={1} value={parts[p.key]}
                onChange={(e) => setParts((w) => ({ ...w, [p.key]: Number(e.target.value) }))} />
            </div>
          ))}
          <p className="text-[12px] text-muted leading-relaxed">
            Score = sum of parts ÷ sum of weights × 100. Hot ≥ {DEFAULT_WEIGHTS.tiers.hot}, Warm ≥ {DEFAULT_WEIGHTS.tiers.warm}.
            Re-ranked in your browser as you drag.
          </p>
          <Link href="/method#weights" className="mono !text-[11px] text-muted hover:text-ink mt-3 inline-block">How scoring works →</Link>
        </div>
      </aside>
    </div>
  );
}

function Th({ k, sort, dir, onSort, children, className = "" }: {
  k?: SortKey; sort: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void; children: React.ReactNode; className?: string;
}) {
  return (
    <th className={className}>
      {k ? (
        <button onClick={() => onSort(k)} className={`uppercase tracking-[0.12em] ${sort === k ? "text-ink" : "hover:text-ink"}`}>
          {children}{sort === k ? (dir === "desc" ? " ↓" : " ↑") : ""}
        </button>
      ) : children}
    </th>
  );
}

// The dropdown under a lead row: the facts worth reading before opening the
// brief, the four score parts, and a link to the full company page.
function LeadSummary({ l }: { l: LeadRow & { b: ReturnType<typeof scoreCompany> } }) {
  const best = l.postings.find((p) => p.id === l.b.overlap.bestPostingId);
  const tasks = TASK_IDS.filter((t) => l.taskWeights[t]).sort((a, b) => l.taskWeights[b] - l.taskWeights[a]).slice(0, 3);
  const fact = (label: string, body: React.ReactNode) => (
    <div className="min-w-0">
      <div className="label mb-1.5">{label}</div>
      <div className="text-[14.5px] text-body leading-snug">{body}</div>
    </div>
  );
  return (
    <div className="bg-surface px-4 sm:px-6 py-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {fact("Best role", <><Link className="text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink" href={`/postings/${best?.id}`}>{best?.title}</Link> · {pct(l.b.overlap.bestOverlap)} overlap</>)}
        {fact("Live-agent proof", l.bestQuote
          ? <Link className="text-ink live-underline" href={`/postings/${l.bestQuote.postingId}#e${l.bestQuote.idx}`}>“{l.bestQuote.quote}”</Link>
          : "No quote stored")}
        {fact("Doing by hand", tasks.length
          ? <ul className="flex flex-col gap-0.5">{tasks.map((t) => <li key={t}><span className="mono text-covered">{t}</span> {taskShort(t)}</li>)}</ul>
          : "—")}
        {fact("Manual-work cost", l.cost != null ? <><span className="text-ink">{money(l.cost)}</span> a year across {l.costRoles} role{l.costRoles > 1 ? "s" : ""} with salary data</> : "No salary data")}
      </div>
      <div className="border-t border-line pt-6">
        <Breakdown l={l} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link href={`/companies/${l.slug}`} className="btn btn-primary btn-sm">Full breakdown →</Link>
        <span className="mono !text-[11px] text-muted">Brief, every role, triggers, tools, cost and gaps</span>
      </div>
    </div>
  );
}

function Breakdown({ l }: { l: LeadRow & { b: ReturnType<typeof scoreCompany> } }) {
  const b = l.b;
  const best = l.postings.find((p) => p.id === b.overlap.bestPostingId);
  const cell = (label: string, pts: number, max: number, body: React.ReactNode) => (
    <div className="min-w-0">
      <div className="label mb-1">{label}</div>
      <div className="font-display text-[22px] text-ink">{pts.toFixed(1)}<span className="text-muted text-[14px]"> / {max}</span></div>
      <div className="text-[13px] text-body mt-1 leading-snug">{body}</div>
    </div>
  );
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cell("Overlap", b.overlap.points, b.overlap.max, <>
        Best role <Link className="text-ink underline underline-offset-4" href={`/postings/${b.overlap.bestPostingId}`}>{best?.title}</Link> at {pct(b.overlap.bestOverlap)}
        {b.overlap.extraRoles > 0 && <>, +{b.overlap.bonus.toFixed(1)} for {b.overlap.extraRoles} more role{b.overlap.extraRoles > 1 ? "s" : ""}</>}.
      </>)}
      {cell("Live-agent strength", b.live.points, b.live.max, <>
        <Link className="text-ink underline underline-offset-4" href={`/postings/${b.live.postingId}#e0`}>{LIVE_STRENGTH_TEXT[b.live.strength]}</Link> ({b.live.strength}/25).
      </>)}
      {cell("Fit", b.fit.points, b.fit.max, <>
        {segmentName(l.segment)} ({Math.round(b.fit.segmentScore * 100)}%), size {l.employeeBand} ({Math.round(b.fit.sizeScore * 100)}%){b.fit.capped ? ", capped for agent platforms" : ""}.
      </>)}
      {cell("Timing", b.timing.points, b.timing.max, b.timing.active.length ? (
        <ul className="flex flex-col gap-1">
          {b.timing.active.slice(0, 4).map((t) => (
            <li key={t.id}><a className="underline underline-offset-4 decoration-line-strong hover:text-ink" href={t.url ?? "#"} target={t.url?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{TRIGGER_NAMES[t.kind]}</a> · {t.points} pts · {shortDate(t.date)}</li>
          ))}
        </ul>
      ) : "No active trigger in the last 90 days.")}
    </div>
  );
}
