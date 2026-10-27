import type { Metadata } from "next";
import { getLeadRows } from "@/lib/data";
import { FAIL_REASON_TEXT, type FailReason } from "@/lib/analyze";
import { LeadsView } from "./LeadsView";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { leads, rejectedPostings } = getLeadRows();
  const initial = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? ""]));
  const rejected = rejectedPostings.map((p) => ({
    id: p.id,
    title: p.title,
    company: p.companyName,
    companySlug: p.companySlug,
    reason: p.failReason!,
    reasonText: FAIL_REASON_TEXT[p.failReason as FailReason] ?? p.failReason!,
    detail: p.failDetail,
    overlap: p.overlap,
    extracted: !!p.extractedAt,
  }));

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageHeader eyebrow="Ranked leads" title="Who to contact this week">
        Companies with at least one open role whose main job is NeoSigma&apos;s work, with an agent already in front of real users.
        Scores are computed in code from the extracted fields; move the weights to re-rank.
      </PageHeader>
      <LeadsView leads={leads.filter((l) => l.status === "lead")} rejected={rejected} initial={initial} />
    </div>
  );
}
