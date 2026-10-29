"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { downloadCsv } from "@/lib/csv";
import { money, pct } from "@/lib/format";
import { useHash } from "@/components/useHash";
import { Collapse } from "@/components/Collapse";

export interface GapThemeView {
  id: number; name: string; kind: string; description: string | null; status: string;
  postingCount: number; companyCount: number; hotWarmShare: number; hotWarmCompanies: number;
  exampleQuote: string | null; roles: string[]; salaryAttached: number; salaryPostings: number;
  duties: { id: number; text: string; span: string; postingId: string; idx: number; title: string; company: string; companySlug: string; isLead: boolean }[];
}

const MAX_EXAMPLES = 8;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
      <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeTable({ list, strongTotal, open, setOpen }: {
  list: GapThemeView[]; strongTotal: number; open: number | null; setOpen: (id: number | null) => void;
}) {
  const head = ["Theme", "Strong leads", "Postings", "Companies", "Salary attached", ""];
  return (
    <div className="rounded-[14px] border border-line bg-bg">
      <table className="w-full table-fixed border-collapse text-[14px]">
        {/* Fixed widths so nothing shifts when a row opens. On phones the
            counts move under the theme name. */}
        <colgroup>
          <col />
          <col className="w-[5.5rem] md:w-[8.5rem]" />
          <col className="w-0 md:w-[6.5rem]" />
          <col className="w-0 md:w-[7rem]" />
          <col className="w-0 md:w-[8.5rem]" />
          <col className="w-[3.25rem] md:w-[3.75rem]" />
        </colgroup>
        <thead className="border-b border-line">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`px-3 md:px-4 py-3 font-normal whitespace-nowrap ${i > 0 && i < 5 ? "text-right" : "text-left"} ${i >= 2 && i <= 4 ? "max-md:!p-0" : ""}`}>
                {h && <span className={`label !text-[11.5px] ${i >= 2 && i <= 4 ? "max-md:hidden" : ""}`}>{h}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((t) => {
            const isOpen = open === t.id;
            const companies = [...new Map(t.duties.map((d) => [d.companySlug, d])).values()];
            return (
              <Fragment key={t.id}>
                <tr id={`g${t.id}`} onClick={() => setOpen(isOpen ? null : t.id)}
                  className={`cursor-pointer scroll-mt-28 border-t border-line align-top transition-colors duration-150 hover:bg-surface ${isOpen ? "bg-surface" : ""}`}>
                  <td className="px-3 md:px-4 py-4">
                    <span className="text-[15px] font-medium text-ink">{t.name}</span>
                    {t.description && <div className="mt-1 text-[13px] leading-snug text-muted">{t.description}</div>}
                    <div className="mt-2 flex flex-wrap gap-x-2 font-mono text-[12px] text-muted md:hidden">
                      <span>{t.postingCount} postings</span><span aria-hidden="true">·</span><span>{t.companyCount} companies</span>
                      {t.salaryPostings > 0 && <><span aria-hidden="true">·</span><span>{money(t.salaryAttached, { compact: true })} salary</span></>}
                    </div>
                  </td>
                  <td className="px-3 md:px-4 py-4 text-right">
                    <span className="font-display text-[20px] leading-none text-ink">{pct(t.hotWarmShare)}</span>
                    <div className="mt-1 font-mono text-[11.5px] text-muted">{t.hotWarmCompanies} of {strongTotal}</div>
                  </td>
                  <td className="px-4 py-4 text-right max-md:!p-0"><div className="max-md:hidden text-ink">{t.postingCount}</div></td>
                  <td className="px-4 py-4 text-right max-md:!p-0"><div className="max-md:hidden text-ink">{t.companyCount}</div></td>
                  <td className="px-4 py-4 text-right max-md:!p-0">
                    <div className="max-md:hidden">
                      <span className="text-ink">{t.salaryPostings ? money(t.salaryAttached, { compact: true }) : "–"}</span>
                      {t.salaryPostings > 0 && <div className="mt-1 font-mono text-[11px] text-muted">indicative</div>}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-line-strong bg-surface-2 text-body hover:border-muted hover:text-ink"
                      aria-expanded={isOpen} aria-label={isOpen ? `Hide details for ${t.name}` : `Show details for ${t.name}`}
                      onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : t.id); }}>
                      <Chevron open={isOpen} />
                    </button>
                  </td>
                </tr>
                <tr className={isOpen ? "bg-surface" : ""} aria-hidden={!isOpen}>
                  <td colSpan={6} className="p-0">
                    <Collapse open={isOpen}>
                      <div className="px-3 md:px-4 pb-5 pt-1">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
                          <div className="rounded-[12px] border border-line bg-bg p-4">
                            <span className="label">Example phrases (verbatim)</span>
                            <ul className="mt-3 flex flex-col gap-2.5">
                              {t.duties.slice(0, MAX_EXAMPLES).map((d) => (
                                <li key={d.id} className="text-[14px] text-body">
                                  “{d.span}”{" "}
                                  <Link href={`/postings/${d.postingId}#d${d.idx}`} className="whitespace-nowrap text-[13px] text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink">{d.company} role</Link>
                                </li>
                              ))}
                            </ul>
                            {t.duties.length > MAX_EXAMPLES && <p className="mt-3 text-[12.5px] text-muted">+{t.duties.length - MAX_EXAMPLES} more duties in this theme.</p>}
                          </div>
                          <div className="rounded-[12px] border border-line bg-bg p-4">
                            <span className="label">Companies</span>
                            <ul className="mt-3 flex flex-wrap gap-1.5">
                              {companies.map((d) => (
                                <li key={d.companySlug}>
                                  <Link href={`/companies/${d.companySlug}`} className={`inline-block rounded-full border px-2.5 py-0.5 text-[13px] hover:border-muted ${d.isLead ? "border-line-strong text-ink" : "border-line text-body"}`}>{d.company}</Link>
                                </li>
                              ))}
                            </ul>
                            <span className="label mt-4 block">Roles</span>
                            <p className="mt-1.5 text-[13px] leading-relaxed text-body">{t.roles.slice(0, 6).join(" · ")}{t.roles.length > 6 ? ` · +${t.roles.length - 6} more` : ""}</p>
                            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                              {t.duties.length} duties across {t.postingCount} postings. Salary attached = each role&apos;s salary midpoint × the share of its duties in this theme, summed over roles that list pay.
                            </p>
                          </div>
                        </div>
                      </div>
                    </Collapse>
                  </td>
                </tr>
              </Fragment>
            );
          })}
          {!list.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No themes yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function GapsView({ themes, strongTotal }: { themes: GapThemeView[]; strongTotal: number }) {
  const [picked, setOpen] = useState<number | null | undefined>(undefined);
  const [humanOpen, setHumanOpen] = useState(false);
  const hash = useHash();
  const hashId = hash.match(/^#g(\d+)$/)?.[1];
  const open = picked !== undefined ? picked : hashId ? Number(hashId) : null;

  const gaps = useMemo(() => themes.filter((t) => t.kind === "possible_gap"), [themes]);
  const human = useMemo(() => themes.filter((t) => t.kind === "human_work"), [themes]);

  function exportCsv() {
    downloadCsv("gap-themes.csv", ["theme", "kind", "description", "strong_lead_share_pct", "strong_lead_companies", "postings", "companies", "salary_attached_indicative", "roles", "example_phrases"],
      themes.map((t) => [t.name, t.kind, t.description ?? "", Math.round(t.hotWarmShare * 100), t.hotWarmCompanies, t.postingCount, t.companyCount,
        t.salaryPostings ? Math.round(t.salaryAttached) : "", t.roles.join("; "), t.duties.slice(0, 5).map((d) => `${d.company}: ${d.span}`).join(" | ")]));
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[900px] text-[14px] text-muted">
            Ranked by share of strong leads: of the {strongTotal} lead companies scoring 55 or more, how many have the theme in their postings. Click a row for verbatim phrases, companies and roles.
          </p>
          <button className="btn btn-secondary btn-sm shrink-0" onClick={exportCsv}>Export CSV</button>
        </div>
        <ThemeTable list={gaps} strongTotal={strongTotal} open={open} setOpen={setOpen} />
      </div>

      {human.length > 0 && (
        <div>
          <button type="button" onClick={() => setHumanOpen((o) => !o)} aria-expanded={humanOpen} className="group flex w-full items-start justify-between gap-4 text-left">
            <span>
              <span className="h-card">Human work <span className="text-muted">({human.length} themes)</span></span>
              <span className="mt-1 block text-[14px] text-muted">Needs people by nature: managing staff, customer and stakeholder calls, roadmaps. Not a product gap.</span>
            </span>
            <span className="mt-1 inline-flex shrink-0 items-center gap-2 rounded-[10px] border border-line-strong bg-surface-2 px-3 py-1.5 text-[13px] text-body transition-colors group-hover:border-muted group-hover:text-ink">
              {humanOpen ? "Hide" : "Show"} <Chevron open={humanOpen} />
            </span>
          </button>
          <Collapse open={humanOpen}>
            <div className="pt-4"><ThemeTable list={human} strongTotal={strongTotal} open={open} setOpen={setOpen} /></div>
          </Collapse>
        </div>
      )}
    </div>
  );
}
