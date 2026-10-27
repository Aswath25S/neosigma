import type { Metadata } from "next";
import { getGaps } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { GapsView, type GapThemeView } from "./GapsView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gaps" };

export default async function GapsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const themes: GapThemeView[] = getGaps().map((t) => ({
    id: t.id, name: t.name, kind: t.kind, description: t.description, status: t.status,
    postingCount: t.postingCount, companyCount: t.companyCount, hotWarmShare: t.hotWarmShare, hotWarmCompanies: t.hotWarmCompanies,
    exampleQuote: t.exampleQuote, roles: t.roles,
    duties: t.duties.map((d) => ({
      id: d.id, text: d.text, span: d.span, postingId: d.postingId, idx: d.idx, title: d.title,
      company: d.company.name, companySlug: d.company.slug, tier: d.company.status === "lead" ? d.company.tier : null,
    })),
  }));
  return (
    <div className="mx-auto max-w-[960px] px-4 sm:px-6">
      <PageHeader eyebrow="Roadmap" title="What NeoSigma doesn't cover yet">
        Duties that fall outside T1–T6, grouped into themes by Claude. Ranked by how many Hot and Warm leads have them, not by raw
        counts. The themes listed in the build spec are hypotheses to confirm, not findings.
      </PageHeader>
      <GapsView themes={themes} initialStatus={sp.status ?? ""} />
    </div>
  );
}
