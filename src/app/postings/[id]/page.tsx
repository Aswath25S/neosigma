import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPosting } from "@/lib/data";
import { reportFromStored } from "@/lib/report";
import { PostingReport } from "@/components/PostingReport";
import { segmentName } from "@/lib/config";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const v = getPosting(id);
  return { title: v ? `${v.posting.title} · ${v.company.name}` : "Posting" };
}

export default async function PostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = getPosting(id);
  if (!v) notFound();
  const data = reportFromStored(v.posting, v.company.name, v.company.slug, v.duties, v.midpoint);

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <div className="pt-12 pb-10">
        <div className="label mb-4 flex flex-wrap gap-x-2">
          <Link href="/leads" className="hover:text-ink">Leads</Link>
          <span>/</span>
          <Link href={`/companies/${v.company.slug}`} className="hover:text-ink">{v.company.name}</Link>
          <span>/</span>
          <span>Evidence</span>
        </div>
        <h1 className="h-page !text-[clamp(30px,5vw,44px)]">{v.posting.title}</h1>
        <p className="mono text-muted mt-3">
          {v.company.name} • {segmentName(v.company.segment)} • Posted {shortDate(v.posting.postedAt)} •{" "}
          <a href={v.posting.url} target="_blank" rel="noreferrer" className="hover:text-ink underline underline-offset-4 decoration-line-strong">Original posting ↗</a>
        </p>
      </div>
      <PostingReport data={data} />
    </div>
  );
}
