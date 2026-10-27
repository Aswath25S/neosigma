// npm run news
// Timing signals from public news feeds: funding, agent launches and
// acquisitions per lead company (Google News RSS plus any company blog feed
// in config/company_feeds.json), and major model releases from the lab feeds
// in config/model_release_feeds.json. Headlines are pre-filtered with
// keywords, then a Claude check confirms each one is about the company and
// names the trigger kind.

import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/client";
import { cached, hasApiKey, structuredCall } from "../src/lib/claude";
import { MODELS, modelReleaseFeeds, weights } from "../src/lib/config";
import { googleNewsUrl, readFeed, type FeedItem } from "../src/lib/rss";
import { ModelReleaseCheckSchema, NewsCheckSchema } from "../src/lib/schemas";
import { sha256 } from "../src/lib/text";
import { setMeta } from "../src/lib/meta";

const KIND_HINT = /\b(raises?|raised|funding|series [a-h]|seed round|valuation|launch(es|ed)?|unveil|introduc|announc|releases?|new agent|agents?|acquir|acquisition|buys|merge)/i;
const COMPANY_FEEDS = path.join(process.cwd(), "config", "company_feeds.json");

const NEWS_SYSTEM = `You check news headlines for a sales research tool. For each headline, decide whether it is about the named company itself (not a different company with a similar name, and not a passing mention), and which trigger it is:
- funding: the company announced a funding round.
- agent_launch: the company launched a new AI agent product or a major agent feature.
- acquisition: the company was acquired, or acquired another company.
- public_complaints: public complaints or reporting about the quality of the company's AI agent.
- none: anything else, including company profile or database pages (Tracxn, Crunchbase, PitchBook, CB Insights "funding rounds" or "investors" listings), rumours of talks that have not closed, and opinion pieces.
Judge from the headline only. Reply with JSON only.`;

const MODEL_SYSTEM = `You check AI lab news headlines. For each, decide whether it announces the release of a major new frontier AI model generally available to developers (for example a new GPT, Claude, Gemini, Llama, Mistral or Grok model). Product features, research papers, partnerships, pricing changes and minor updates are not major model releases. Reply with JSON only.`;

async function main() {
  if (!hasApiKey()) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  const db = getDb();
  const now = new Date();
  const fetchedAt = now.toISOString();
  const windowDays = weights.timing.window_days;
  const companyFeeds: Record<string, string> = fs.existsSync(COMPANY_FEEDS)
    ? JSON.parse(fs.readFileSync(COMPANY_FEEDS, "utf8")).feeds ?? {}
    : {};

  // News is fetched for companies with at least one qualifying posting.
  const leadIds = new Set(
    db.select({ id: schema.postings.companyId }).from(schema.postings).where(eq(schema.postings.passedGates, true)).all().map((r) => r.id),
  );
  const leads = db.select().from(schema.companies).all().filter((c) => leadIds.has(c.id));
  console.log(`news for ${leads.length} lead companies`);

  for (const c of leads) {
    const name = c.name.replace(/\s*\(.*\)$/, "");
    const items: (FeedItem & { source: string })[] = [];
    try {
      const q = `"${name}" (AI OR agent) (raises OR funding OR launches OR agent OR acquires OR acquired)`;
      items.push(...(await readFeed(googleNewsUrl(q, windowDays))).map((i) => ({ ...i, source: "news" })));
    } catch (err) {
      console.warn(`  ${c.name}: news fetch failed (${(err as Error).message})`);
    }
    if (companyFeeds[c.name]) {
      try {
        items.push(...(await readFeed(companyFeeds[c.name])).map((i) => ({ ...i, source: "blog" })));
      } catch (err) {
        console.warn(`  ${c.name}: blog feed failed (${(err as Error).message})`);
      }
    }
    const recent = items
      .filter((i) => i.date && (now.getTime() - Date.parse(i.date)) / 86_400_000 <= windowDays)
      .filter((i) => KIND_HINT.test(i.title))
      .slice(0, 25);

    db.delete(schema.triggers).where(and(eq(schema.triggers.companyId, c.id), inArray(schema.triggers.source, ["news", "blog"]))).run();
    if (!recent.length) {
      console.log(`  ${c.name}: no candidate headlines`);
      continue;
    }
    const list = recent.map((i, idx) => `${idx}. ${i.title} (${i.date!.slice(0, 10)})`).join("\n");
    const user = `Company: ${c.name} (${c.domain})\n\nHeadlines:\n${list}`;
    const check = await cached("news", [MODELS.newsCheck, sha256(NEWS_SYSTEM), user], () =>
      structuredCall({ model: MODELS.newsCheck, system: NEWS_SYSTEM, user, schema: NewsCheckSchema, effort: "low", maxTokens: 8000 }),
    );
    let added = 0;
    const seen = new Set<string>();
    for (const r of check.items) {
      const item = recent[r.index];
      if (!item || !r.about_company || r.kind === "none") continue;
      // One trigger per kind per day is enough; syndicated copies repeat.
      const key = `${r.kind}:${item.date!.slice(0, 10)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      db.insert(schema.triggers).values({
        companyId: c.id, kind: r.kind, points: weights.timing.triggers[r.kind], date: item.date!,
        title: item.title, url: item.link, source: item.source, fetchedAt,
      }).run();
      added++;
    }
    console.log(`  ${c.name}: ${added} triggers from ${recent.length} headlines`);
  }

  // ---- Model releases (apply to every lead) ----
  const relWindow = weights.timing.model_release_window_days;
  const hint = new RegExp(modelReleaseFeeds.title_hint, "i");
  const candidates: (FeedItem & { lab: string })[] = [];
  for (const f of modelReleaseFeeds.feeds) {
    try {
      const url = f.kind === "rss" ? f.url! : googleNewsUrl(f.query!, relWindow);
      const items = await readFeed(url);
      candidates.push(...items
        .filter((i) => i.date && (now.getTime() - Date.parse(i.date)) / 86_400_000 <= relWindow && hint.test(i.title))
        .slice(0, 15)
        .map((i) => ({ ...i, lab: f.lab })));
    } catch (err) {
      console.warn(`  model feed ${f.lab} failed (${(err as Error).message})`);
    }
  }
  db.delete(schema.triggers).where(and(isNull(schema.triggers.companyId), eq(schema.triggers.kind, "model_release"))).run();
  if (candidates.length) {
    const list = candidates.map((i, idx) => `${idx}. [${i.lab}] ${i.title} (${i.date!.slice(0, 10)})`).join("\n");
    const check = await cached("model_release", [MODELS.newsCheck, sha256(MODEL_SYSTEM), list], () =>
      structuredCall({ model: MODELS.newsCheck, system: MODEL_SYSTEM, user: list, schema: ModelReleaseCheckSchema, effort: "low", maxTokens: 8000 }),
    );
    const seenModels = new Set<string>();
    for (const r of check.items) {
      const item = candidates[r.index];
      if (!item || !r.is_major_model_release) continue;
      const key = (r.model_name ?? item.title).toLowerCase();
      if (seenModels.has(key)) continue;
      seenModels.add(key);
      db.insert(schema.triggers).values({
        companyId: null, kind: "model_release", points: weights.timing.triggers.model_release, date: item.date!,
        title: r.model_name ? `${item.lab} released ${r.model_name}` : item.title, url: item.link, source: "model_feed", fetchedAt,
      }).run();
    }
    console.log(`model releases in the last ${relWindow} days: ${seenModels.size}`);
  }
  setMeta("last_news", { at: fetchedAt, companies: leads.length });
}

main();
