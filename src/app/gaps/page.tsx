import type { Metadata } from "next";
import { getGaps } from "@/lib/data";
import { pct } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { GapsView, type GapThemeView } from "./GapsView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gaps" };

export default async function GapsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { themes: rows, strongTotal } = getGaps();
  const themes: GapThemeView[] = rows.map((t) => ({
    id: t.id, name: t.name, kind: t.kind, description: t.description, status: t.status,
    postingCount: t.postingCount, companyCount: t.companyCount, hotWarmShare: t.hotWarmShare, hotWarmCompanies: t.hotWarmCompanies,
    exampleQuote: t.exampleQuote, roles: t.roles, salaryAttached: t.salaryAttached, salaryPostings: t.salaryPostings,
    duties: t.duties.map((d) => ({
      id: d.id, text: d.text, span: d.span, postingId: d.postingId, idx: d.idx, title: d.title,
      company: d.company.name, companySlug: d.company.slug, isLead: d.company.status === "lead",
    })),
  }));
  const gaps = themes.filter((t) => t.kind === "possible_gap");
  const top = gaps[0];
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageHeader
        eyebrow="The gaps"
        title={top ? `${top.name} shows up at ${pct(top.hotWarmShare)} of strong leads and is outside NeoSigma's six tasks.` : "What NeoSigma doesn't cover yet"}
      >
        Every duty in these postings that falls outside NeoSigma&apos;s six tasks is grouped into a theme by Claude. Themes are ranked by how many
        strong leads (lead score ≥ 55) have them, not by raw counts, since a gap inside an otherwise good lead is the gap that blocks a deal.
        Not being one of the six tasks does not mean NeoSigma can&apos;t do it.
        <span className="block mono text-muted mt-4">{gaps.length} possible gaps · {themes.length} themes · {themes.reduce((a, t) => a + t.duties.length, 0)} duties</span>
      </PageHeader>
      {themes.length ? <GapsView themes={themes} strongTotal={strongTotal} initialStatus={sp.status ?? ""} /> : (
        <EmptyState title="No themes yet">Run <code className="mono text-ink">npm run themes</code> after extraction to group not-covered duties.</EmptyState>
      )}
    </div>
  );
}
