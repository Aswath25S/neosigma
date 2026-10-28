import type { Metadata } from "next";
import { getDb, schema } from "@/lib/db/client";
import { allMidpoints } from "@/lib/data";
import { roleFamily } from "@/lib/cost";
import { weights } from "@/lib/config";
import { PageHeader } from "@/components/ui";
import { CostView, type CostRole } from "./CostView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cost" };

export default function CostPage() {
  const db = getDb();
  const companies = new Map(db.select().from(schema.companies).all().map((c) => [c.id, c]));
  const mids = allMidpoints();
  const roles: CostRole[] = db.select().from(schema.postings).all()
    .filter((p) => p.passedGates && companies.get(p.companyId)?.status === "lead")
    .map((p) => {
      const c = companies.get(p.companyId)!;
      const m = mids.get(p.id);
      return {
        postingId: p.id, title: p.title, family: roleFamily(p.title), company: c.name, companySlug: c.slug, tier: c.tier,
        overlap: p.overlap ?? 0, midpoint: m?.value ?? null, estimated: m?.estimated ?? false, basis: m?.basis ?? "no salary",
        salaryMin: p.salaryMin, salaryMax: p.salaryMax,
      };
    });
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageHeader eyebrow="The money" title="What the manual work costs">
        A minimum estimate of what each lead spends doing NeoSigma&apos;s work by hand, from posted salary ranges. This is the
        cost of the work, <span className="text-ink">not a NeoSigma price or a guaranteed saving</span>.
      </PageHeader>
      <CostView roles={roles} defaultLoad={weights.cost.load_factor} minSameTitle={weights.cost.min_same_title_postings} />
    </div>
  );
}
