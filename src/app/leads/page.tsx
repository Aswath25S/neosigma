import type { Metadata } from "next";
import { getLeadRows } from "@/lib/data";
import { FAIL_REASON_TEXT, type FailReason } from "@/lib/analyze";
import { LeadsView } from "./LeadsView";
import { plainTasks } from "@/lib/config";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { leads, rejectedPostings } = getLeadRows();
  const live = leads.filter((l) => l.status === "lead");
  const initial = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? ""]));
  const rejected = rejectedPostings.map((p) => ({
    id: p.id,
    title: p.title,
    company: p.companyName,
    companySlug: p.companySlug,
    reason: p.failReason!,
    reasonText: plainTasks(FAIL_REASON_TEXT[p.failReason as FailReason] ?? p.failReason!),
    detail: plainTasks(p.failDetail),
    overlap: p.overlap,
    extracted: !!p.extractedAt,
  }));

  return (
    <>
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageHeader eyebrow="The leads" title={`${live.length} companies are paying people to do NeoSigma's work by hand.`}>
        Each has at least one open role whose main job is checking and improving a live AI agent, and proof in the posting that the agent is
        already in front of real users. Every company gets a lead score from 0 to 100. Claude reads the postings and the news; the score is
        then fixed arithmetic on what it found, so the same data always gives the same score: how much of the role NeoSigma can do (40 points),
        how clearly the agent is live (25), how well the company fits as a buyer (15), and whether recent news gives a reason to reach out
        now (20). Move the weights to re-rank. Click any row to see its qualifying roles and why it scores what it does.
      </PageHeader>
    </div>
    {/* Wider than the page column: the weights box sits further left so the
        table keeps most of the width. */}
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 mt-6 sm:mt-10">
      <LeadsView leads={live} rejected={rejected} initial={initial} />
    </div>
    </>
  );
}
