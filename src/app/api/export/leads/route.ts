import { getLeadRows } from "@/lib/data";
import { segmentName } from "@/lib/config";
import { TRIGGER_NAMES, type Breakdown } from "@/lib/scoring";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

// Leads at default weights. The Leads page exports its current view instead.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const { leads } = getLeadRows();
  const rows = leads
    .filter((l) => l.status === "lead")
    .sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0))
    .map((l) => {
      const b = l.breakdown as Breakdown;
      return [
        l.name, segmentName(l.segment), Math.round(l.leadScore ?? 0), Math.round(b.overlap.bestOverlap * 100), b.live.strength,
        b.fit.points.toFixed(1), b.timing.points.toFixed(1), b.timing.topTrigger ? TRIGGER_NAMES[b.timing.topTrigger.kind] : "",
        b.timing.topTrigger?.date.slice(0, 10) ?? "", l.avgSalary != null ? Math.round(l.avgSalary) : "", l.postings.length, `${origin}/companies/${l.slug}`,
      ];
    });
  const csv = toCsv(
    ["company", "segment", "lead_score", "overlap_pct", "live_agent_strength", "fit_points", "timing_points", "top_trigger", "top_trigger_date", "avg_salary_usd", "qualifying_roles", "company_url"],
    rows,
  );
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="leads.csv"' } });
}
