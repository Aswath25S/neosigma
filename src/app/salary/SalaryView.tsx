"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { mean, median, salaryUsed, type Salary, type SalaryBasis } from "@/lib/salary";
import { money, pct } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import defaults from "../../../config/weights.json";

export interface SalaryRow {
  postingId: string; title: string; family: string; company: string; companySlug: string; overlap: number;
  salaryMin: number | null; salaryMax: number | null; currency: string | null; salary: Salary | null;
}

interface CompanyBar { company: string; slug: string; value: number; roles: number }

const DEFAULT_BASIS = defaults.salary.basis as SalaryBasis;
const DEFAULT_CONVERTED = defaults.salary.include_converted;

function range(r: SalaryRow): string | null {
  if (r.salaryMin == null) return null;
  const hi = r.salaryMax && r.salaryMax !== r.salaryMin ? `–${money(r.salaryMax, { compact: true }).replace("$", "")}` : "";
  return `${money(r.salaryMin, { compact: true })}${hi}${r.currency && r.currency !== "USD" ? ` ${r.currency}` : ""}`;
}

function BarTip({ active, payload }: { active?: boolean; payload?: { payload: CompanyBar }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-[10px] border border-line-strong bg-surface-2 px-3 py-2 text-[13px] shadow-xl">
      <div className="text-ink">{d.company}</div>
      <div className="text-body">{money(d.value)} average across {d.roles} {d.roles === 1 ? "role" : "roles"}</div>
    </div>
  );
}

export function SalaryView({ rows }: { rows: SalaryRow[] }) {
  const router = useRouter();
  // Middle of each posted range, converted salaries included (config/weights.json → salary).
  const counted = (r: SalaryRow) => (r.salary && (DEFAULT_CONVERTED || !r.salary.converted) ? salaryUsed(r.salary, DEFAULT_BASIS) : null);
  const calc = rows.map((r) => ({ ...r, value: counted(r) }));
  const used = calc.filter((r) => r.value != null);

  const byCompany = (() => {
    const m = new Map<string, { company: string; slug: string; xs: number[] }>();
    for (const r of used) {
      const e = m.get(r.companySlug) ?? { company: r.company, slug: r.companySlug, xs: [] };
      e.xs.push(r.value!);
      m.set(r.companySlug, e);
    }
    return [...m.values()].map((e) => ({ company: e.company, slug: e.slug, value: mean(e.xs)!, roles: e.xs.length }))
      .sort((a, b) => b.value - a.value).slice(0, 15);
  })();

  const byFamily = (() => {
    const m = new Map<string, { all: number; xs: number[] }>();
    for (const r of calc) {
      const e = m.get(r.family) ?? { all: 0, xs: [] };
      e.all++;
      if (r.value != null) e.xs.push(r.value);
      m.set(r.family, e);
    }
    return [...m.entries()].map(([family, e]) => ({ family, roles: e.all, withSalary: e.xs.length, avg: mean(e.xs), med: median(e.xs) }))
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  })();
  const maxFam = Math.max(1, ...byFamily.map((f) => f.avg ?? 0));

  if (!rows.length) return <EmptyState title="No qualifying roles yet">Run the pipeline to collect leads.</EmptyState>;

  return (
    <div className="flex flex-col gap-16">
      {/* Per company */}
      <section>
        <h3 className="h-page !text-[28px]">Top companies by average salary.</h3>
        <div className="mt-5 card card-pad">
          <div style={{ height: Math.max(240, byCompany.length * 34) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCompany} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 8 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tickFormatter={(v: number) => money(v, { compact: true })} tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="company" width={140} tick={{ fill: "var(--text-body)", fontSize: 13 }} axisLine={false} tickLine={false} />
                <Tooltip content={<BarTip />} cursor={{ fill: "var(--surface-2)" }} />
                <Bar dataKey="value" fill="var(--covered)" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}
                  label={{ position: "right", fill: "var(--text-body)", fontSize: 12, formatter: (v: unknown) => money(Number(v), { compact: true }) }}
                  onClick={(d: unknown) => { const slug = (d as { payload?: CompanyBar }).payload?.slug; if (slug) router.push(`/companies/${slug}#roles`); }}
                  style={{ cursor: "pointer" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {byCompany.map((c) => <li key={c.slug}><Link href={`/companies/${c.slug}#roles`} className="text-ink underline underline-offset-4 decoration-line-strong">{c.company}</Link> <span className="text-muted">{money(c.value, { compact: true })}</span></li>)}
          </ul>
        </div>
      </section>

      {/* By role family */}
      <section>
        <h3 className="h-page !text-[28px]">Where the pay sits, by role family.</h3>
        <div className="mt-5 card overflow-x-auto">
          <table className="w-full text-[14px] md:min-w-[620px]">
            <thead className="border-b border-line">
              <tr>{["Role family", "Roles", "With salary", "Average", "", "Median"].map((h, i) => <th key={i} className={`px-4 py-3 font-normal ${i === 0 || i === 4 ? "text-left" : "text-right"} ${i === 4 ? "hidden sm:table-cell" : ""}`}><span className="label">{h}</span></th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {byFamily.map((f) => (
                <tr key={f.family}>
                  <td className="px-4 py-3 text-ink">{f.family}</td>
                  <td className="px-4 py-3 text-right text-body">{f.roles}</td>
                  <td className="px-4 py-3 text-right text-body">{f.withSalary}</td>
                  <td className="px-4 py-3 text-right text-ink">{f.avg != null ? money(f.avg) : "–"}</td>
                  <td className="hidden w-[30%] px-4 py-3 sm:table-cell"><div className="h-2 rounded-r-[4px] bg-covered" style={{ width: `${((f.avg ?? 0) / maxFam) * 100}%` }} /></td>
                  <td className="px-4 py-3 text-right text-body">{f.med != null ? money(f.med) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Every role */}
      <section id="roles">
        <h3 className="h-page !text-[28px]">Every role, with its breakdown.</h3>
        <p className="mt-2 text-[14px] text-muted">Click a row to open that role&apos;s duty-by-duty breakdown.</p>
        <div className="mt-5 card overflow-x-auto">
          <table className="w-full text-[14px] md:min-w-[900px]">
            <thead className="border-b border-line">
              <tr>{["Role", "Company", "Overlap", "Posted range", "Midpoint (USD)"].map((h, i) => (
                <th key={i} className={`px-4 py-3 font-normal md:whitespace-nowrap ${i < 2 ? "text-left" : "text-right"} ${i >= 1 && i <= 3 ? "hidden md:table-cell" : ""}`}><span className="label">{h}</span></th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...calc].sort((a, b) => (b.value ?? -1) - (a.value ?? -1)).map((r) => (
                <tr key={r.postingId} onClick={() => router.push(`/postings/${r.postingId}`)} className="cursor-pointer transition-colors hover:bg-surface-2" title="Open the role breakdown">
                  <td className="px-4 py-3">
                    <Link href={`/postings/${r.postingId}`} onClick={(e) => e.stopPropagation()} className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">{r.title}</Link>
                    {/* On phones, company and range sit under the title. */}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted md:hidden">
                      <span>{r.company}</span>{range(r) && <span>{range(r)}</span>}
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3"><Link href={`/companies/${r.companySlug}`} onClick={(e) => e.stopPropagation()} className="text-body hover:text-ink">{r.company}</Link></td>
                  <td className="hidden md:table-cell px-4 py-3 text-right text-body">{pct(r.overlap)}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-right text-body">{range(r) ?? "–"}</td>
                  <td className="px-4 py-3 text-right text-ink">{r.value != null ? money(r.value) : <span className="text-[13px] text-muted">{r.salary ? "Not counted" : "No salary posted"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
