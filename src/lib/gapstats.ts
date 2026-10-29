import { eq } from "drizzle-orm";
import { getDb, schema } from "./db/client";

// Recounts postings, companies and strong-lead share for every gap theme.
// Themes are ranked by the share of strong lead companies (score at or above
// the Warm threshold) whose postings contain the theme, not by raw counts.
export function refreshThemeStats(): void {
  const db = getDb();
  const companies = db.select().from(schema.companies).all();
  const hotWarm = new Set(companies.filter((c) => c.status === "lead" && (c.tier === "Hot" || c.tier === "Warm")).map((c) => c.id));
  const rows = db.select({ themeId: schema.duties.gapThemeId, postingId: schema.duties.postingId, companyId: schema.postings.companyId, dutyId: schema.duties.id, span: schema.duties.sourceSpan })
    .from(schema.duties)
    .innerJoin(schema.postings, eq(schema.duties.postingId, schema.postings.id))
    .all()
    .filter((r) => r.themeId != null);
  for (const theme of db.select().from(schema.gapThemes).all()) {
    const mine = rows.filter((r) => r.themeId === theme.id);
    const postingsSet = new Set(mine.map((r) => r.postingId));
    const companySet = new Set(mine.map((r) => r.companyId));
    const hw = [...companySet].filter((id) => hotWarm.has(id)).length;
    const example = mine.find((r) => hotWarm.has(r.companyId)) ?? mine[0];
    db.update(schema.gapThemes).set({
      postingCount: postingsSet.size,
      companyCount: companySet.size,
      hotWarmCompanies: hw,
      hotWarmShare: hotWarm.size ? hw / hotWarm.size : 0,
      exampleQuote: example?.span ?? null,
      exampleDutyId: example?.dutyId ?? null,
    }).where(eq(schema.gapThemes.id, theme.id)).run();
  }
}
