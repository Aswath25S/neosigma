import type { Metadata } from "next";
import { getDb, schema } from "@/lib/db/client";
import { allSalaries } from "@/lib/data";
import { mean, roleFamily } from "@/lib/salary";
import { money } from "@/lib/format";
import { getMeta } from "@/lib/meta";
import { PageHeader } from "@/components/ui";
import { SalaryView, type SalaryRow } from "./SalaryView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Salary & Roles" };

export default function SalaryPage() {
  const db = getDb();
  const companies = new Map(db.select().from(schema.companies).all().map((c) => [c.id, c]));
  const salaries = allSalaries();
  const rows: SalaryRow[] = db.select().from(schema.postings).all()
    .filter((p) => p.passedGates && companies.get(p.companyId)?.status === "lead")
    .map((p) => {
      const c = companies.get(p.companyId)!;
      return {
        postingId: p.id, title: p.title, family: roleFamily(p.title), company: c.name, companySlug: c.slug,
        overlap: p.overlap ?? 0, salaryMin: p.salaryMin, salaryMax: p.salaryMax, currency: p.currency,
        salary: salaries.get(p.id) ?? null,
      };
    });
  const withSalary = rows.filter((r) => r.salary);
  const avg = mean(withSalary.map((r) => r.salary!.mid));
  const fx = getMeta<{ date: string }>("fx");

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageHeader
        eyebrow="Salary & Roles"
        title={avg != null ? `Across ${withSalary.length} qualifying roles that list a salary, the average is ${money(avg)} a year.` : "No qualifying role lists a salary yet."}
      >
        This is what companies pay today for a person whose main job is NeoSigma&apos;s work: the salary on the table before the next hire.
        Each role counts at the middle of its posted range.
        <span className="block mono text-muted mt-4">
          Based on {withSalary.length} of {rows.length} qualifying roles that list a salary · posted salaries only, nothing estimated
          {fx ? ` · non-USD converted at ECB rates of ${fx.date}` : ""}
        </span>
      </PageHeader>
      <SalaryView rows={rows} />
    </div>
  );
}
