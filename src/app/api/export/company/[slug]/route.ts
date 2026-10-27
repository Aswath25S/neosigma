import { getCompanyBySlug } from "@/lib/data";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

// One company's qualifying duties, for the brief's SHARE → CSV link.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = getCompanyBySlug(slug);
  if (!v) return new Response("not found", { status: 404 });
  const origin = new URL(req.url).origin;
  const ids = new Set(v.qualifying.map((p) => p.id));
  const titles = new Map(v.postings.map((p) => [p.id, p.title]));
  const rows = v.duties
    .filter((d) => ids.has(d.postingId))
    .map((d) => [v.company.name, titles.get(d.postingId), d.text, d.sourceSpan, d.label, d.taskId ?? "", d.notCoveredKind ?? "", d.confidence, `${origin}/postings/${d.postingId}#d${d.idx}`]);
  const csv = toCsv(["company", "role", "duty", "source_span", "label", "task_id", "not_covered_kind", "confidence", "evidence_url"], rows);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-duties.csv"` } });
}
