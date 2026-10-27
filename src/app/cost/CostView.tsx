"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { yearlyCost } from "@/lib/cost";
import { money, pct } from "@/lib/format";
import { EmptyState } from "@/components/ui";

export interface CostRole {
  postingId: string; title: string; family: string; company: string; companySlug: string; tier: string | null;
  overlap: number; midpoint: number | null; estimated: boolean; basis: string; salaryMin: number | null; salaryMax: number | null;
}

interface CompanyBar { company: string; slug: string; cost: number; roles: number; estimated: number }

function BarTip({ active, payload }: { active?: boolean; payload?: { payload: CompanyBar }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-[10px] border border-line-strong bg-surface-2 px-3 py-2 text-[13px] shadow-xl">
      <div className="text-ink">{d.company}</div>
      <div className="text-body">{money(d.cost)} a year</div>
      <div className="text-muted">{d.roles} role{d.roles > 1 ? "s" : ""}{d.estimated ? `, ${d.estimated} with estimated salary` : ""}</div>
    </div>
  );
}

export function CostView({ roles, defaultLoad, minSameTitle }: { roles: CostRole[]; defaultLoad: number; minSameTitle: number }) {
  const router = useRouter();
  const [load, setLoad] = useState(defaultLoad);
  const [example, setExample] = useState({ min: 110000, max: 140000, overlap: 0.75 });
  const exampleCost = yearlyCost((example.min + example.max) / 2, load, example.overlap);

  const priced = useMemo(() => roles.filter((r) => r.midpoint != null).map((r) => ({ ...r, cost: yearlyCost(r.midpoint!, load, r.overlap) })), [roles, load]);
  const byCompany = useMemo(() => {
    const m = new Map<string, CompanyBar>();
    for (const r of priced) {
      const cur = m.get(r.companySlug) ?? { company: r.company, slug: r.companySlug, cost: 0, roles: 0, estimated: 0 };
      cur.cost += r.cost;
      cur.roles++;
      if (r.estimated) cur.estimated++;
      m.set(r.companySlug, cur);
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost);
  }, [priced]);
  const byFamily = useMemo(() => {
    const m = new Map<string, { family: string; cost: number; roles: number; priced: number }>();
    for (const r of roles) {
      const cur = m.get(r.family) ?? { family: r.family, cost: 0, roles: 0, priced: 0 };
      cur.roles++;
      if (r.midpoint != null) { cur.priced++; cur.cost += yearlyCost(r.midpoint, load, r.overlap); }
      m.set(r.family, cur);
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost);
  }, [roles, load]);
  const total = priced.reduce((s, r) => s + r.cost, 0);
  const coverage = roles.length ? priced.length / roles.length : 0;
  const maxFamily = Math.max(1, ...byFamily.map((f) => f.cost));

  const num = (v: number, set: (n: number) => void, step: number, label: string, w = "w-28") => (
    <input type="number" aria-label={label} step={step} value={v} onChange={(e) => set(Number(e.target.value) || 0)}
      className={`${w} h-10 px-3 font-mono text-[14px] text-ink`} />
  );

  return (
    <div className="flex flex-col gap-16">
      {/* Formula with live inputs */}
      <section>
        <div className="label mb-3">01 · The formula</div>
        <div className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
          <div className="font-mono text-[14px] text-ink mb-5">yearly cost = salary midpoint × load factor × overlap</div>
          <div className="flex flex-wrap items-center gap-3 text-[14px]">
            <span className="text-muted">(</span>
            {num(example.min, (n) => setExample((e) => ({ ...e, min: n })), 5000, "Example salary minimum")}
            <span className="text-muted">+</span>
            {num(example.max, (n) => setExample((e) => ({ ...e, max: n })), 5000, "Example salary maximum")}
            <span className="text-muted">) ÷ 2 ×</span>
            {num(load, setLoad, 0.05, "Load factor", "w-20")}
            <span className="text-muted">×</span>
            {num(Math.round(example.overlap * 100), (n) => setExample((e) => ({ ...e, overlap: n / 100 })), 5, "Overlap percent", "w-20")}
            <span className="text-muted">% =</span>
            <span className="font-display text-[28px] text-ink">{money(exampleCost)}</span>
          </div>
          <p className="text-[13px] text-muted mt-4">
            Load factor covers benefits and overhead ({defaultLoad} by default; changing it here updates every number on this page).
            No salary → median of same-title postings, marked estimated, only when at least {minSameTitle} exist; otherwise the role is left out.
          </p>
        </div>
      </section>

      {roles.length === 0 ? (
        <EmptyState title="No qualifying roles yet">Run the pipeline to collect leads.</EmptyState>
      ) : (
        <>
          <section>
            <div className="label mb-3">02 · Total</div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="rounded-[14px] border border-line bg-surface p-5 sm:col-span-2">
                <div className="font-display text-[48px] leading-none text-ink">{money(total)}</div>
                <div className="text-[14px] text-body mt-2">a year of manual work across {byCompany.length} lead companies, at load factor {load}.</div>
              </div>
              <div className="rounded-[14px] border border-line bg-surface p-5">
                <div className="font-display text-[48px] leading-none text-ink">{pct(coverage)}</div>
                <div className="text-[14px] text-body mt-2">salary coverage: {priced.length} of {roles.length} qualifying roles have a posted or estimated salary.</div>
              </div>
            </div>
          </section>

          <section>
            <div className="label mb-1">03 · By company</div>
            <p className="text-[14px] text-muted mb-4">Yearly cost of manual work, summed across each company&apos;s qualifying roles with salary data.</p>
            {byCompany.length ? (
              <div style={{ height: Math.max(160, byCompany.length * 34 + 40) }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byCompany} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={6}>
                    <CartesianGrid horizontal={false} stroke="var(--border)" strokeWidth={1} />
                    <XAxis type="number" tickFormatter={(v: number) => money(v, { compact: true })} tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="company" width={150} tick={{ fill: "var(--text-body)", fontSize: 13 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<BarTip />} cursor={{ fill: "var(--surface)" }} />
                    <Bar dataKey="cost" fill="var(--covered)" radius={[0, 4, 4, 0]} maxBarSize={20}
                      label={{ position: "right", fill: "var(--text-body)", fontSize: 12, formatter: (v: unknown) => money(Number(v), { compact: true }) }}
                      onClick={(d: unknown) => { const slug = (d as { payload?: CompanyBar }).payload?.slug; if (slug) router.push(`/companies/${slug}#cost`); }}
                      style={{ cursor: "pointer" }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-muted">No qualifying role has salary data.</p>}
          </section>

          <section>
            <div className="label mb-3">04 · By role family</div>
            <table className="table">
              <thead><tr><th>Role family</th><th className="text-right">Roles</th><th className="text-right">With salary</th><th>Cost / yr</th></tr></thead>
              <tbody>
                {byFamily.map((f) => (
                  <tr key={f.family}>
                    <td className="text-ink text-[14px]">{f.family}</td>
                    <td className="text-right">{f.roles}</td>
                    <td className="text-right">{f.priced}</td>
                    <td className="w-[40%]">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-covered" style={{ width: `${(f.cost / maxFamily) * 100}%` }} /></div>
                        <span className="text-ink text-[14px] w-16 text-right">{money(f.cost, { compact: true })}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <div className="label mb-3">05 · Every role behind the numbers</div>
            <div className="overflow-x-auto">
              <table className="table min-w-[680px]">
                <thead><tr><th>Company</th><th>Role</th><th className="text-right">Salary midpoint</th><th className="text-right">Overlap</th><th className="text-right">Cost / yr</th></tr></thead>
                <tbody>
                  {[...roles].sort((a, b) => (b.midpoint ?? -1) * b.overlap - (a.midpoint ?? -1) * a.overlap).map((r) => (
                    <tr key={r.postingId}>
                      <td className="text-[14px]"><Link href={`/companies/${r.companySlug}#cost`} className="hover:text-ink">{r.company}</Link></td>
                      <td className="text-[14px]"><Link href={`/postings/${r.postingId}`} className="hover:text-ink underline decoration-line-strong underline-offset-4">{r.title}</Link></td>
                      <td className="text-right text-[14px]">
                        {r.midpoint != null ? <>{money(r.midpoint)}{r.estimated && <span className="mono !text-[10px] text-assisted ml-1" title={r.basis}>EST</span>}</> : <span className="text-muted" title={r.basis}>none</span>}
                      </td>
                      <td className="text-right text-[14px]">{pct(r.overlap)}</td>
                      <td className="text-right text-ink">{r.midpoint != null ? money(yearlyCost(r.midpoint, load, r.overlap)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
