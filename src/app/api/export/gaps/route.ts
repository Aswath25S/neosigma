import { getGaps } from "@/lib/data";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const csv = toCsv(
    ["theme", "kind", "status", "strong_lead_share_pct", "strong_lead_companies", "postings", "companies", "typical_phrasing", "roles"],
    getGaps().themes.map((t) => [t.name, t.kind, t.status, Math.round(t.hotWarmShare * 100), t.hotWarmCompanies, t.postingCount, t.companyCount, t.exampleQuote ?? "", t.roles.join("; ")]),
  );
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="gap-themes.csv"' } });
}
