// npm run sizes [-- --all]
// Fills employee_band and size_source_url in config/sources.csv from a public
// source found with Claude's web search tool. LinkedIn, Glassdoor and Indeed
// are excluded. By default only lead companies are looked up, since fit only
// matters for them (--all for every company). Rows that already have a band
// are skipped.

import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/client";
import { cached, hasApiKey, structuredCall } from "../src/lib/claude";
import { MODELS } from "../src/lib/config";
import { SizeSchema } from "../src/lib/schemas";
import { readSources, writeSources } from "../src/lib/sources";
import { slugify } from "../src/lib/text";

const SYSTEM = `You look up how many employees a company has, using web search. Prefer the company's own site, Wikipedia, press releases, or reputable news. Do not use LinkedIn, Glassdoor or Indeed. Pick the band that matches the most recent public figure. If no public figure is found, answer "unknown" with a null source.

After searching, reply with a single JSON object and nothing else:
{"employee_band": "1-50" | "51-200" | "201-1000" | "1001-5000" | "5001+" | "unknown", "source_url": string | null, "evidence": short quote or null}`;

async function main() {
  if (!hasApiKey()) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  const db = getDb();
  const all = process.argv.includes("--all");
  // Leads are companies with a posting that passed both gates (scores may
  // not have been recomputed yet in this run).
  const leadIds = new Set(db.select({ id: schema.postings.companyId }).from(schema.postings).where(eq(schema.postings.passedGates, true)).all().map((r) => r.id));
  const leadSlugs = new Set(db.select().from(schema.companies).all().filter((c) => leadIds.has(c.id)).map((c) => c.slug));
  const sources = readSources();
  for (const s of sources) {
    if (s.employee_band && s.employee_band !== "unknown") continue;
    if (!all && !leadSlugs.has(slugify(s.company))) continue;
    const user = `Company: ${s.company}\nWebsite: ${s.domain}`;
    try {
      const r = await cached("size", [MODELS.sizes, SYSTEM, user], () =>
        structuredCall({
          model: MODELS.sizes, system: SYSTEM, user, schema: SizeSchema, effort: "low", maxTokens: 8000,
          tools: [{
            type: "web_search_20260209", name: "web_search", max_uses: 3,
            blocked_domains: ["linkedin.com", "glassdoor.com", "indeed.com"],
          }],
        }),
      );
      s.employee_band = r.employee_band;
      s.size_source_url = r.source_url ?? "";
      db.update(schema.companies).set({ employeeBand: r.employee_band, sizeSourceUrl: r.source_url })
        .where(eq(schema.companies.slug, slugify(s.company))).run();
      console.log(`  ${s.company}: ${r.employee_band} ${r.source_url ?? ""}`);
    } catch (err) {
      console.warn(`  ${s.company}: lookup failed (${(err as Error).message})`);
    }
    writeSources(sources);
  }
}

main();
