// npm run briefs [-- --top 10] [-- --slug sierra] [-- --all]
// Generates a one-page brief per lead company from stored data only. Every
// sentence must cite stored evidence; uncited sentences are dropped. Briefs
// are drafts for a person to review; nothing is sent from the app.

import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/client";
import { hasApiKey } from "../src/lib/claude";
import { MODELS } from "../src/lib/config";
import { getCompanyBySlug } from "../src/lib/data";
import { briefMarkdown, generateBrief } from "../src/lib/brief";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  if (!hasApiKey()) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  const db = getDb();
  const top = Number(opt("top") ?? 10);
  let leads = db.select().from(schema.companies).where(eq(schema.companies.status, "lead")).all()
    .sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0));
  if (opt("slug")) leads = leads.filter((c) => c.slug === opt("slug"));
  else if (!args.includes("--all")) leads = leads.slice(0, top);
  console.log(`briefs for ${leads.length} companies`);

  for (const c of leads) {
    const view = getCompanyBySlug(c.slug)!;
    try {
      const r = await generateBrief(view);
      const markdown = briefMarkdown(c.name, r);
      const values = {
        markdown, content: r, draftMessage: r.brief.draft_message, generatedAt: new Date().toISOString(),
        model: MODELS.briefs, reviewed: false,
      };
      db.insert(schema.briefs).values({ companyId: c.id, ...values })
        .onConflictDoUpdate({ target: schema.briefs.companyId, set: values }).run();
      console.log(`  ${c.name}: ok${r.dropped.length ? ` (${r.dropped.length} uncited sentences dropped)` : ""}`);
    } catch (err) {
      console.warn(`  ${c.name}: failed (${(err as Error).message})`);
    }
  }
}

main();
