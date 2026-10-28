import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPosting } from "@/lib/data";
import { reportFromStored } from "@/lib/report";
import { PostingReport } from "@/components/PostingReport";
import { BackLink } from "@/components/BackLink";
import { segmentName } from "@/lib/config";
import { pct, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const v = getPosting(id);
  return { title: v ? `${v.posting.title} at ${v.company.name}` : "Posting" };
}

export default async function PostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = getPosting(id);
  if (!v) notFound();
  const data = reportFromStored(v.posting, v.company.name, v.company.slug, v.duties, v.midpoint, v.themes);
  const c = data.gates.counts;
  const headline = c.total === 0
    ? "This posting was not read duty by duty."
    : c.covered + c.assisted === 0
      ? `None of this role's ${c.total} duties are NeoSigma's work.`
      : `${c.covered + c.assisted} of this role's ${c.total} duties are work NeoSigma automates.`;

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <div className="pt-10 sm:pt-14 pb-10 flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          <BackLink href={`/companies/${v.company.slug}`} label={v.company.name} />
          <BackLink href="/leads" label="All lead companies" />
        </div>
        <div className="label">Role breakdown</div>
        <div className="flex flex-col gap-2">
          <h1 className="h-page !text-[clamp(32px,5vw,48px)] max-w-[1100px]">{v.posting.title}</h1>
          <p className="text-[20px] text-body">
            at <Link href={`/companies/${v.company.slug}`} className="text-ink underline decoration-line-strong decoration-2 underline-offset-4 hover:decoration-ink">{v.company.name}</Link>
            <span className="text-muted"> · {segmentName(v.company.segment)}</span>
          </p>
          <p className="mono text-muted">{v.posting.locations.join(" · ") || "Location not listed"}{v.posting.postedAt ? ` · posted ${shortDate(v.posting.postedAt)}` : ""}</p>
        </div>
        <p className="max-w-[900px] text-[22px] leading-snug text-ink">{headline}</p>
        {c.total > 0 && (
          <p className="max-w-[900px] text-[15px] text-body">
            Every highlight below is a single duty Claude split out of the original text, labelled against NeoSigma&apos;s six tasks and
            quoted word for word. Overlap {pct(data.gates.overlap)}: Covered duties count in full, Assisted duties count half.
          </p>
        )}
      </div>
      <PostingReport data={data} ats={v.posting.ats} />
    </div>
  );
}
