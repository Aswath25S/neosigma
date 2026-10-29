"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_WEIGHTS, scoreCompany, shownTriggers, TRIGGER_NAMES, LIVE_STRENGTH_TEXT, type Weights } from "@/lib/scoring";
import { SEGMENTS, segmentName } from "@/lib/config";
import { money, pct, shortDate } from "@/lib/format";
import { ShareBar, ShareLegend, Note } from "@/components/ui";
import { Select } from "@/components/Select";
import type { LeadRow } from "@/lib/data";
import { downloadCsv } from "@/lib/csv";

interface RejectedRow {
  id: string; title: string; company: string; companySlug: string; reason: string; reasonText: string;
  detail: string | null; overlap: number | null; extracted: boolean;
}

const TABS = ["all", "rejected"] as const;
type Tab = (typeof TABS)[number];

// Plain-language names for the four score parts; formulas live on /method.
const PARTS = [
  { key: "overlap", name: "NeoSigma can do the work", desc: "How much of the work in their best qualifying role is one of NeoSigma's six tasks, plus a bonus for each extra qualifying role." },
  { key: "live_agent", name: "Live agent proof", desc: "How clearly the posting shows an agent real customers already use. A volume number or named product scores highest." },
  { key: "fit", name: "Looks like a buyer", desc: "Segment (agent-native companies first, agent platforms capped since they may build in-house) and company size." },
  { key: "timing", name: "Reason to call now", desc: "The strongest recent trigger: first eval hire, funding, an agent launch, a new model release, several roles open." },
] as const;
type PartKey = (typeof PARTS)[number]["key"];
const SORTS = ["score", "overlap", "salary", "name", "rank"] as const;
type SortKey = (typeof SORTS)[number];
const AGENT_TYPES = ["support", "voice", "coding", "research", "sales", "healthcare", "legal", "finance", "internal", "other"];

function parseWeights(s: string | undefined): Record<PartKey, number> {
  const d = DEFAULT_WEIGHTS.parts;
  const parts = (s ?? "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0)) return { ...d };
  return { overlap: parts[0], live_agent: parts[1], fit: parts[2], timing: parts[3] };
}

type Scored = LeadRow & { b: ReturnType<typeof scoreCompany>; defaultScore: number; rank: number };

export function LeadsView({ leads, rejected, initial }: { leads: LeadRow[]; rejected: RejectedRow[]; initial: Record<string, string> }) {
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(initial.tab) ? (initial.tab as Tab) : "all");
  const [segment, setSegment] = useState(initial.segment ?? "");
  const [agentType, setAgentType] = useState(initial.agent ?? "");
  const [hasSalary, setHasSalary] = useState(initial.salary === "1");
  const [reason, setReason] = useState(initial.reason ?? "");
  const [sort, setSort] = useState<SortKey>((SORTS as readonly string[]).includes(initial.sort) ? (initial.sort as SortKey) : "score");
  const [dir, setDir] = useState<"asc" | "desc">(initial.dir === "asc" ? "asc" : "desc");
  const [parts, setParts] = useState(parseWeights(initial.w));
  const [open, setOpen] = useState<string | null>(initial.open || null);
  const toggle = useCallback((slug: string) => setOpen((o) => (o === slug ? null : slug)), []);

  const isDefault = PARTS.every((p) => parts[p.key] === DEFAULT_WEIGHTS.parts[p.key]);
  const totalWeight = PARTS.reduce((s, p) => s + parts[p.key], 0) || 1;

  // Filter and sort state lives in the URL so a view can be shared.
  useEffect(() => {
    const q = new URLSearchParams();
    if (tab !== "all") q.set("tab", tab);
    if (segment) q.set("segment", segment);
    if (agentType) q.set("agent", agentType);
    if (hasSalary) q.set("salary", "1");
    if (reason) q.set("reason", reason);
    if (sort !== "score") q.set("sort", sort);
    if (dir !== "desc") q.set("dir", dir);
    if (!isDefault) q.set("w", PARTS.map((p) => parts[p.key]).join(","));
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [tab, segment, agentType, hasSalary, reason, sort, dir, parts, isDefault]);

  const scored: Scored[] = useMemo(() => {
    const w: Weights = { ...DEFAULT_WEIGHTS, parts };
    const now = new Date();
    const rows = leads.map((l) => {
      const input = { segment: l.segment, employeeBand: l.employeeBand, postings: l.postings, triggers: l.triggers };
      return { ...l, b: scoreCompany(input, w, now), defaultScore: scoreCompany(input, DEFAULT_WEIGHTS, now).total, rank: 0 };
    });
    [...rows].sort((a, b) => b.b.total - a.b.total || a.name.localeCompare(b.name)).forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }, [leads, parts]);

  const rows = useMemo(() => {
    let r = [...scored];
    if (segment) r = r.filter((l) => l.segment === segment);
    if (agentType) r = r.filter((l) => l.postings.some((p) => p.agentType === agentType));
    if (hasSalary) r = r.filter((l) => l.postings.some((p) => p.hasSalary));
    const val = (l: Scored): number | string => {
      switch (sort) {
        case "overlap": return l.b.overlap.bestOverlap;
        case "salary": return l.avgSalary ?? -1;
        case "name": return l.name.toLowerCase();
        case "rank": return -l.rank;
        default: return l.b.total;
      }
    };
    return [...r].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return dir === "asc" ? c : -c;
    });
  }, [scored, segment, agentType, hasSalary, sort, dir]);

  const rejectedRows = useMemo(() => rejected.filter((r) => !reason || r.reason === reason), [rejected, reason]);
  const reasons = useMemo(() => {
    const m = new Map<string, { text: string; n: number }>();
    for (const r of rejected) m.set(r.reason, { text: r.reasonText, n: (m.get(r.reason)?.n ?? 0) + 1 });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [rejected]);

  const counts = useMemo(() => ({
    all: scored.length,
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
      ["rank", "company", "domain", "segment", "lead_score", "overlap_pct", "live_agent_strength", "fit_points", "timing_points", "top_trigger", "top_trigger_date", "avg_salary_usd", "qualifying_roles", "company_url", "job_links"],
      rows.map((l) => [l.rank, l.name, l.domain, segmentName(l.segment), Math.round(l.b.total), Math.round(l.b.overlap.bestOverlap * 100), l.b.live.strength,
        l.b.fit.points.toFixed(1), l.b.timing.points.toFixed(1), l.b.timing.topTrigger ? TRIGGER_NAMES[l.b.timing.topTrigger.kind] : "",
        l.b.timing.topTrigger?.date.slice(0, 10) ?? "", l.avgSalary != null ? Math.round(l.avgSalary) : "",
        l.postings.length, `${location.origin}/companies/${l.slug}`, l.postings.map((p) => p.url).join(" ")]));
  }

  const th = (k: SortKey | null, label: React.ReactNode, cls = "") => (
    <th scope="col" className={`px-2 sm:px-3 py-3 font-normal ${cls.includes("text-right") ? "" : "text-left"} ${cls}`}>
      {k ? (
        <button onClick={() => sortBy(k)} className={`label !text-[11.5px] hover:!text-ink ${sort === k ? "!text-ink" : ""}`}>
          {label}{sort === k ? (dir === "desc" ? " ↓" : " ↑") : ""}
        </button>
      ) : <span className="label !text-[11.5px]">{label}</span>}
    </th>
  );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* What the score weighs */}
      <aside className="lg:self-start">
        <div className="card card-pad">
          <div className="flex items-baseline justify-between gap-3">
            <span className="label whitespace-nowrap">Score weights</span>
            <button onClick={() => setParts({ ...DEFAULT_WEIGHTS.parts })} className={`mono !text-[12px] ${isDefault ? "text-muted" : "text-ink underline underline-offset-4"}`}>Reset</button>
          </div>
          <div className="mt-5 flex flex-col gap-5">
            {PARTS.map((p) => (
              <div key={p.key}>
                <div className="flex items-baseline gap-3">
                  <label htmlFor={`w-${p.key}`} className="text-[14px] font-medium text-ink leading-snug">{p.name}</label>
                  <span className="ml-auto font-display text-[20px] leading-none text-ink">{Math.round((parts[p.key] / totalWeight) * 100)}%</span>
                </div>
                <input id={`w-${p.key}`} type="range" min={0} max={60} step={1} value={parts[p.key]} className="mt-2"
                  aria-valuetext={`${Math.round((parts[p.key] / totalWeight) * 100)}% of the score`}
                  onChange={(e) => setParts((w) => ({ ...w, [p.key]: Number(e.target.value) }))} />
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{p.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[12.5px] leading-relaxed text-muted">
            Default: 40 / 25 / 15 / 20. Slide to re-rank instantly.{!isDefault && " Scores below use your weights."}
          </p>
          <Link href="/method#weights" className="mono !text-[12px] text-body hover:text-ink mt-3 inline-block underline underline-offset-4 decoration-line-strong">How scores are calculated</Link>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line pb-3 mb-5" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`mono py-1 border-b-2 ${tab === t ? "text-ink border-ink" : "text-muted border-transparent hover:text-ink"}`}>
              {t === "all" ? "Leads" : "Rejected roles"} <span className="text-muted">{counts[t]}</span>
            </button>
          ))}
          <button className="ml-auto btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
        </div>

        {tab !== "rejected" ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Select label="Segment" value={segment} onChange={setSegment} allLabel="All segments" options={SEGMENTS.map((x) => [x.id, x.name])} />
              <Select label="Agent type" value={agentType} onChange={setAgentType} allLabel="All agent types" options={AGENT_TYPES.map((x) => [x, x[0].toUpperCase() + x.slice(1)])} />
              <div className="flex flex-col gap-1.5">
                <span className="label">Salary</span>
                <label className="text-[14px] text-body inline-flex items-center gap-2.5 h-10 px-3.5 rounded-[10px] border border-line-strong bg-surface-2 cursor-pointer hover:border-muted">
                  <input type="checkbox" checked={hasSalary} onChange={(e) => setHasSalary(e.target.checked)} className="accent-[var(--covered)]" />
                  Has a posted salary
                </label>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <span className="label">Showing {rows.length} of {scored.length} lead companies · click a row for details</span>
            </div>
            <ShareLegend className="mb-4" />

            <div className="rounded-[14px] border border-line bg-bg overflow-hidden">
              <table className="w-full table-fixed border-collapse text-[14px]">
                {/* Fixed widths so headers never shift when a row opens. On phones,
                    tier, overlap and cost move under the company name. */}
                <colgroup>
                  <col className="w-[2.5rem] md:w-[4rem]" />
                  <col />
                  <col className="w-[4rem] md:w-[8rem]" />
                  <col className="w-0 md:w-[15rem]" />
                  <col className="w-0 md:w-[10rem]" />
                  <col className="w-[3.25rem] md:w-[12.5rem]" />
                </colgroup>
                <thead className="border-b border-line">
                  <tr>
                    {th("rank", "#")}
                    {th("name", "Company")}
                    {th("score", "Score", "text-right md:!pr-8")}
                    {th("overlap", "Overlap", "md:!pl-6 max-md:!p-0 max-md:[&>*]:hidden")}
                    {th("salary", "Avg. salary", "text-right md:!pr-6 max-md:!p-0 max-md:[&>*]:hidden")}
                    <th scope="col" className="px-2 sm:px-3 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <LeadRowView key={l.slug} l={l} isOpen={open === l.slug} custom={!isDefault} parts={parts} totalWeight={totalWeight} onToggle={toggle} />
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={6} className="px-3 py-10 text-center text-muted">No leads match these filters{leads.length ? "" : ". Run the pipeline (npm run all) to collect data"}.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Note>
                <b>Avg. salary</b> is the average yearly pay across the company&apos;s qualifying roles that list a salary, using the middle of each posted range
                (non-USD salaries converted at the ECB rate). Every role is on <Link href="/salary" className="underline underline-offset-4">Salary &amp; Roles</Link>.
              </Note>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 mb-6">
              <Select className="w-full sm:w-[420px]" label="Fail reason" value={reason} onChange={setReason} allLabel="All fail reasons" options={reasons.map(([k, v]) => [k, `${v.text} (${v.n})`])} />
            </div>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** One table row plus its expandable details. Memoised so opening a row re-renders only that row. */
const LeadRowView = memo(function LeadRowView({ l, isOpen, custom, parts, totalWeight, onToggle }: {
  l: Scored; isOpen: boolean; custom: boolean; parts: Record<PartKey, number>; totalWeight: number; onToggle: (slug: string) => void;
}) {
  const best = l.postings[0];
  return (
    <>
      <tr className={`cursor-pointer border-t border-line transition-colors duration-150 hover:bg-surface ${isOpen ? "bg-surface" : ""}`} onClick={() => onToggle(l.slug)}>
        <td className="px-2 sm:px-3 py-4 align-top md:align-middle font-mono text-[12.5px] text-muted">{String(l.rank).padStart(2, "0")}</td>
        <td className="px-2 sm:px-3 py-4">
          <span className="text-[15px] font-medium text-ink">{l.name}</span>
          <div className="mt-1 font-mono text-[12px] text-muted">{l.postings.length} qualifying {l.postings.length === 1 ? "role" : "roles"} · {segmentName(l.segment)}</div>
          <div className="md:hidden mt-2.5">
            <ShareBar covered={best?.counts.coveredShare ?? 0} assisted={best?.counts.assistedShare ?? 0} />
            <div className="label mt-1.5 !normal-case !tracking-[0.04em] flex flex-wrap gap-x-2">
              <span>{pct(l.b.overlap.bestOverlap)} overlap</span><span aria-hidden="true">·</span>
              <span>{l.avgSalary != null ? `${money(l.avgSalary, { compact: true })} avg. salary` : "no salary posted"}</span>
            </div>
          </div>
        </td>
        <td className="px-2 sm:px-3 md:pr-8 py-4 text-right align-top md:align-middle">
          <span className="font-display text-[24px] leading-none text-ink">{Math.round(l.b.total)}</span>
          {custom && <div className="label mt-1 !normal-case">default {Math.round(l.defaultScore)}</div>}
        </td>
        <td className="px-3 md:pl-6 md:pr-4 py-4 max-md:!p-0">
          <div className="max-md:hidden">
            <ShareBar covered={best?.counts.coveredShare ?? 0} assisted={best?.counts.assistedShare ?? 0} />
            <div className="label mt-1.5 !normal-case !tracking-[0.04em]">{pct(l.b.overlap.bestOverlap)}{l.postings.length > 1 ? ` · best of ${l.postings.length}` : ""}</div>
          </div>
        </td>
        <td className="px-3 md:pr-6 py-4 text-right max-md:!p-0">
          <div className="max-md:hidden">
            {l.avgSalary != null ? <span className="text-ink">{money(l.avgSalary, { compact: true })}</span> : <span className="text-[13px] text-muted">No salary posted</span>}
            {l.avgSalary != null && l.salaryRoles < l.postings.length && <div className="label mt-1 !normal-case">{l.salaryRoles} of {l.postings.length} roles</div>}
          </div>
        </td>
        <td className="px-2 sm:px-3 py-4 align-top md:align-middle">
          <div className="flex items-center justify-end gap-2.5">
          <Link href={`/companies/${l.slug}`} onClick={(e) => e.stopPropagation()} className="btn btn-secondary !h-9 !px-3.5 !text-[12.5px] !rounded-[10px] !hidden md:!inline-flex">View case</Link>
          <button
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line-strong bg-surface-2 text-body hover:border-muted hover:text-ink"
            aria-expanded={isOpen} aria-controls={`lead-${l.slug}`} aria-label={isOpen ? `Hide details for ${l.name}` : `Show details for ${l.name}`}
            onClick={(e) => { e.stopPropagation(); onToggle(l.slug); }}>
            <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 transition-transform duration-[550ms] ${isOpen ? "rotate-180" : ""}`}>
              <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          </div>
        </td>
      </tr>
      <tr id={`lead-${l.slug}`} className={isOpen ? "bg-surface" : ""} aria-hidden={!isOpen}>
        <td colSpan={6} className="p-0">
          <div className={`grid transition-[grid-template-rows,opacity] duration-[550ms] ease-[cubic-bezier(0.45,0,0.2,1)] ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="min-h-0 overflow-hidden">
              <div className="px-3 sm:px-5 pb-6 pt-2" inert={!isOpen}>
                <Details l={l} parts={parts} totalWeight={totalWeight} />
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
});

function Details({ l, parts, totalWeight }: { l: Scored; parts: Record<PartKey, number>; totalWeight: number }) {
  const b = l.b;
  const share = (k: PartKey) => Math.round((parts[k] / totalWeight) * 100);
  const part = (k: PartKey, pts: number, max: number, text: React.ReactNode) => {
    const p = PARTS.find((x) => x.key === k)!;
    const v = max ? pts / max : 0;
    return (
      <div className="card-inset">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-medium text-ink">{p.name}</span>
          <span className="font-mono text-[12px] text-ink whitespace-nowrap">{pts.toFixed(1)} pts</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-surface-2 ring-1 ring-line"><div className="h-full rounded-full bg-covered" style={{ width: `${Math.min(1, v) * 100}%` }} /></div>
        <p className="mt-2 text-[13px] leading-relaxed text-body">{text}</p>
        <p className="label mt-2 !normal-case !tracking-[0.04em]">{Math.round(v * 100)}/100 · weight {share(k)}%</p>
      </div>
    );
  };
  const fact = (k: string, v: React.ReactNode) => <div><dt className="label">{k}</dt><dd className="mt-1 text-[14px] text-ink">{v}</dd></div>;
  const types = [...new Set(l.postings.map((p) => p.agentType).filter(Boolean))];

  return (
    <div className="flex flex-col gap-6 py-2">
      <dl className="flex flex-wrap gap-x-10 gap-y-3">
        {fact("Segment", segmentName(l.segment))}
        {fact("Employees", <>{l.employeeBand === "unknown" ? "Unknown" : l.employeeBand}{" "}
          {l.sizeSourceUrl && <a href={l.sizeSourceUrl} target="_blank" rel="noreferrer" className="text-[12.5px] text-body underline underline-offset-4 decoration-line-strong hover:text-ink">(source ↗)</a>}</>)}
        {fact("Agent type", types.length ? types.join(", ") : "Not stated")}
        {fact("Tools named", l.tools.length ? l.tools.slice(0, 5).join(", ") + (l.tools.length > 5 ? ` +${l.tools.length - 5}` : "") : "None named")}
      </dl>

      {l.bestQuote && (
        <div>
          <span className="label">Proof of a live agent</span>
          <p className="mt-1.5 text-[15px] text-ink">
            <Link href={`/postings/${l.bestQuote.postingId}#e${l.bestQuote.idx}`} className="live-underline">“{l.bestQuote.quote}”</Link>
          </p>
        </div>
      )}

      <div>
        <span className="label">Qualifying roles</span>
        <ul className="mt-2 divide-y divide-line card-inset !p-0">
          {l.postings.map((x) => (
            <li key={x.id} className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-6">
              <span>
                <span className="text-[14.5px] font-medium text-ink">{x.title}</span>
                {x.agentType && <span className="label ml-2 !normal-case">{x.agentType} agent</span>}
              </span>
              <span>
                <ShareBar covered={x.counts.coveredShare} assisted={x.counts.assistedShare} />
                <span className="label mt-1 block !normal-case !tracking-[0.04em]">{pct(x.overlap)} overlap · {x.counts.covered} covered, {x.counts.assisted} assisted of {x.counts.total}</span>
              </span>
              <span className="text-[13px] leading-snug text-body">
                {x.salaryMin != null ? <>Salary {money(x.salaryMin, { compact: true })}{x.salaryMax && x.salaryMax !== x.salaryMin ? `–${money(x.salaryMax, { compact: true })}` : ""}{x.currency && x.currency !== "USD" ? ` ${x.currency}` : ""}</> : <span className="text-muted">No salary posted</span>}
                {x.salaryMid != null && x.currency && x.currency !== "USD" && <span className="block text-muted">≈ {money(x.salaryMid, { compact: true })} USD midpoint</span>}
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                <Link href={`/postings/${x.id}`} className="text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink whitespace-nowrap">Role breakdown</Link>
                <a href={x.url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink whitespace-nowrap">Job posting ↗</a>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <span className="label">Why it scores {Math.round(b.total)}</span>
        <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
          {part("overlap", b.overlap.points, b.overlap.max, <>
            Best role does {pct(b.overlap.bestOverlap)} NeoSigma work{b.overlap.extraRoles > 0 ? `, plus ${b.overlap.bonus.toFixed(1)} for ${b.overlap.extraRoles} more qualifying ${b.overlap.extraRoles === 1 ? "role" : "roles"}` : ""}.
          </>)}
          {part("live_agent", b.live.points, b.live.max, <>{LIVE_STRENGTH_TEXT[b.live.strength]} ({b.live.strength} of 25): the posting quotes {b.live.strength >= 25 ? "a volume number or a named agent product" : "the agent being live or in production"}.</>)}
          {part("fit", b.fit.points, b.fit.max, <>{segmentName(l.segment)} ({Math.round(b.fit.segmentScore * 100)}% segment fit), {l.employeeBand === "unknown" ? "size unknown" : `${l.employeeBand} employees`}{b.fit.capped ? "; capped because agent platforms may build in-house" : ""}.</>)}
          {part("timing", b.timing.points, b.timing.max, b.timing.topTrigger
            ? <>{TRIGGER_NAMES[b.timing.topTrigger.kind]} on {shortDate(b.timing.topTrigger.date)}{shownTriggers(b.timing.active).length > 1 ? `, and ${shownTriggers(b.timing.active).length - 1} more active ${shownTriggers(b.timing.active).length === 2 ? "trigger" : "triggers"}` : ""}.</>
            : "No funding, launch, model release or hiring trigger in the last 90 days.")}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/companies/${l.slug}`} className="btn btn-primary btn-sm">View full case for {l.name}</Link>
      </div>
    </div>
  );
}
