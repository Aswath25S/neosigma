"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { downloadCsv } from "@/lib/csv";
import { pct } from "@/lib/format";
import { EmptyState, TierChip } from "@/components/ui";
import { useHash } from "@/components/useHash";
import { Collapse } from "@/components/Collapse";

export interface GapThemeView {
  id: number; name: string; kind: string; description: string | null; status: string;
  postingCount: number; companyCount: number; hotWarmShare: number; hotWarmCompanies: number;
  exampleQuote: string | null; roles: string[];
  duties: { id: number; text: string; span: string; postingId: string; idx: number; title: string; company: string; companySlug: string; tier: string | null }[];
}

const STATUSES = ["Unreviewed", "Real gap", "Already covered", "Not relevant"];

function ThemeRow({ t, onStatus }: { t: GapThemeView; onStatus: (id: number, s: string) => void }) {
  const [toggled, setOpen] = useState<boolean | null>(null);
  const hash = useHash();
  const open = toggled ?? hash === `#g${t.id}`;
  const companies = [...new Map(t.duties.map((d) => [d.companySlug, d])).values()];
  return (
    <li id={`g${t.id}`} className="border-b border-line scroll-mt-24">
      <div className="py-4 grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_90px_90px_100px_170px] gap-x-4 gap-y-2 items-center">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="text-left min-w-0 col-span-2 sm:col-span-1">
          <div className="text-ink text-[16px] font-medium flex items-center gap-2.5">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`shrink-0 text-muted transition-transform duration-300 ${open ? "rotate-90" : ""}`}>
              <path d="M4 2.5 L8 6 L4 9.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.name}
          </div>
          {t.exampleQuote && <div className="text-[13px] text-muted truncate pl-[22px]">“{t.exampleQuote}”</div>}
        </button>
        <button onClick={() => setOpen(true)} className="text-left sm:text-right text-[14px]" title="Share of Hot and Warm lead companies with this theme">
          <span className="text-ink underline underline-offset-4 decoration-line-strong">{pct(t.hotWarmShare)}</span>
          <span className="label sm:hidden ml-2">hot/warm</span>
        </button>
        <button onClick={() => setOpen(true)} className="text-left sm:text-right text-[14px]">
          <span className="text-ink underline underline-offset-4 decoration-line-strong">{t.postingCount}</span>
          <span className="label sm:hidden ml-2">postings</span>
        </button>
        <button onClick={() => setOpen(true)} className="text-left sm:text-right text-[14px]">
          <span className="text-ink underline underline-offset-4 decoration-line-strong">{t.companyCount}</span>
          <span className="label sm:hidden ml-2">companies</span>
        </button>
        <select aria-label={`Status for ${t.name}`} className="h-9 px-2 text-[13px] col-span-2 sm:col-span-1" value={t.status} onChange={(e) => onStatus(t.id, e.target.value)}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <Collapse open={open}>
        <div className="pb-6 pl-6">
          {t.description && <p className="text-[14px] text-body mb-4">{t.description}</p>}
          <div className="label mb-2">Quotes</div>
          <ul className="flex flex-col gap-2 mb-5">
            {t.duties.map((d) => (
              <li key={d.id} className="text-[14px]">
                <Link href={`/postings/${d.postingId}#d${d.idx}`} className="hl hl-not_covered">“{d.span}”</Link>
                <span className="text-muted text-[13px]"> — {d.title}, {d.company}</span>
              </li>
            ))}
          </ul>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <div className="label mb-2">Companies</div>
              <ul className="flex flex-col gap-1.5">
                {companies.map((d) => (
                  <li key={d.companySlug} className="text-[14px] flex items-center gap-2">
                    <Link href={`/companies/${d.companySlug}`} className="hover:text-ink">{d.company}</Link>
                    {d.tier && <TierChip tier={d.tier} />}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label mb-2">Roles</div>
              <ul className="flex flex-col gap-1.5 text-[14px]">{t.roles.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          </div>
        </div>
      </Collapse>
    </li>
  );
}

export function GapsView({ themes: initial, initialStatus }: { themes: GapThemeView[]; initialStatus: string }) {
  const [themes, setThemes] = useState(initial);
  const [status, setStatus] = useState(STATUSES.includes(initialStatus) ? initialStatus : "");
  const [error, setError] = useState<string | null>(null);
  const [humanOpen, setHumanOpen] = useState(false);

  useEffect(() => {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    window.history.replaceState(null, "", `${window.location.pathname}${q}${window.location.hash}`);
  }, [status]);

  async function onStatus(id: number, s: string) {
    const prev = themes;
    setThemes((ts) => ts.map((t) => (t.id === id ? { ...t, status: s } : t)));
    const res = await fetch(`/api/gaps/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) });
    if (!res.ok) {
      setThemes(prev);
      setError("Could not save the status.");
    }
  }

  const gaps = useMemo(() => themes.filter((t) => t.kind === "possible_gap" && (!status || t.status === status)), [themes, status]);
  const human = useMemo(() => themes.filter((t) => t.kind === "human_work"), [themes]);

  function exportCsv() {
    downloadCsv("gap-themes.csv", ["theme", "kind", "status", "hot_warm_share_pct", "hot_warm_companies", "postings", "companies", "typical_phrasing", "roles"],
      themes.map((t) => [t.name, t.kind, t.status, Math.round(t.hotWarmShare * 100), t.hotWarmCompanies, t.postingCount, t.companyCount, t.exampleQuote ?? "", t.roles.join("; ")]));
  }

  if (!themes.length) {
    return <EmptyState title="No themes yet">Run <code className="mono text-ink">npm run themes</code> after extraction to group not-covered duties.</EmptyState>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line pb-3 mb-2" role="tablist">
        {["", ...STATUSES].map((s) => (
          <button key={s || "all"} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
            className={`mono ${status === s ? "text-ink" : "text-muted hover:text-ink"}`}>
            {s || "All"} <span className="text-muted">{themes.filter((t) => t.kind === "possible_gap" && (!s || t.status === s)).length}</span>
          </button>
        ))}
        <button className="ml-auto btn btn-outline btn-sm" onClick={exportCsv}>CSV</button>
      </div>
      {error && <p role="alert" className="text-assisted text-[13px] my-2">{error}</p>}
      <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_90px_90px_100px_170px] gap-x-4 pt-4 pb-3 border-b border-line">
        <span className="label">Theme · typical phrasing</span>
        <span className="label text-right">Hot/Warm</span>
        <span className="label text-right">Postings</span>
        <span className="label text-right">Companies</span>
        <span className="label">Status</span>
      </div>
      <ul>{gaps.map((t) => <ThemeRow key={t.id} t={t} onStatus={onStatus} />)}</ul>
      {!gaps.length && <p className="text-muted py-8">No themes with this status.</p>}

      {human.length > 0 && (
        <div className="mt-14">
          <button onClick={() => setHumanOpen((o) => !o)} aria-expanded={humanOpen} className="flex items-center gap-3 text-left">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`text-muted transition-transform duration-300 ${humanOpen ? "rotate-90" : ""}`}>
              <path d="M4 2.5 L8 6 L4 9.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="h-card">Human work</span>
            <span className="text-muted text-[14px]">{human.length} themes · managing people, calls, roadmaps; never automated</span>
          </button>
          <Collapse open={humanOpen}>
            <ul className="mt-4">{human.map((t) => <ThemeRow key={t.id} t={t} onStatus={onStatus} />)}</ul>
          </Collapse>
        </div>
      )}
    </div>
  );
}
