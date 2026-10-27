// npm run fetch
// Reads every board in config/sources.csv plus manual imports and keeps a
// posting when its title is on the keep/conditional/drop lists, or its title
// mentions AI, or its description passes the keyword pre-screen. Titles on
// neither list are judged on their description by the Claude screen in
// `npm run extract`. Applies the English, region and age rules, dedupes, and
// upserts into the database. Closed postings are removed.

import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/client";
import { fetchBoard } from "../src/lib/fetchers/boards";
import { readManualPostings, readManualUrls } from "../src/lib/fetchers/manual";
import type { RawPosting, SalaryRange } from "../src/lib/fetchers/types";
import { ageInDays, descriptionHits, isEnglish, locationInScope, matchTitle } from "../src/lib/filters";
import { roles } from "../src/lib/config";
import type { Stage1 } from "../src/lib/analyze";
import { readSources } from "../src/lib/sources";
import { normalizeTitle, sha256, slugify, textSimilarity } from "../src/lib/text";
import { weights } from "../src/lib/config";
import { setMeta } from "../src/lib/meta";

const RAW_DIR = path.join(process.cwd(), "data", "raw", "boards");

function postingId(p: RawPosting): string {
  return sha256(`${p.ats}:${p.companyName}:${p.externalId}`).slice(0, 12);
}

interface Candidate extends RawPosting {
  titleList: string;
  failReason: string | null;
  normalizedTitle: string;
  stage1: Stage1;
}

// Two postings are one role when company and normalized title match and the
// descriptions are at least 90% similar. Every location's salary is kept.
function dedupe(cands: Candidate[]): { kept: Candidate[]; merged: number } {
  const kept: Candidate[] = [];
  let merged = 0;
  for (const c of cands) {
    const twin = kept.find(
      (k) => k.companyName === c.companyName && k.normalizedTitle === c.normalizedTitle &&
        textSimilarity(k.text, c.text) >= weights.fetch.dedupe_similarity,
    );
    if (!twin) {
      kept.push({ ...c, locations: [...c.locations], salaries: [...c.salaries] });
      continue;
    }
    merged++;
    twin.locations = [...new Set([...twin.locations, ...c.locations])];
    const seen = new Set(twin.salaries.map((s) => JSON.stringify(s)));
    for (const s of c.salaries) if (!seen.has(JSON.stringify(s))) twin.salaries.push(s);
    // A re-post keeps the role fresh: use the newest posting date.
    if (c.postedAt && (!twin.postedAt || c.postedAt > twin.postedAt)) twin.postedAt = c.postedAt;
    if (twin.failReason && !c.failReason) {
      twin.failReason = null;
      twin.url = c.url;
    }
  }
  return { kept, merged };
}

function salarySummary(salaries: SalaryRange[]) {
  const annual = salaries.filter((s) => s.min || s.max).filter((s) => !s.interval || /year|annual|1 YEAR|per-year-salary/i.test(s.interval));
  if (!annual.length) return { min: null, max: null, currency: null, source: null };
  const mins = annual.map((s) => s.min ?? s.max!).filter(Boolean);
  const maxs = annual.map((s) => s.max ?? s.min!).filter(Boolean);
  return { min: Math.min(...mins), max: Math.max(...maxs), currency: annual[0].currency ?? "USD", source: "board" };
}

async function main() {
  const db = getDb();
  const sources = readSources();
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const now = new Date();
  const maxAge = weights.fetch.max_posting_age_days;

  // Upsert companies from the seed list.
  for (const s of sources) {
    const slug = slugify(s.company);
    const existing = db.select().from(schema.companies).where(eq(schema.companies.slug, slug)).get();
    const values = {
      name: s.company, slug, domain: s.domain, segment: s.segment, ats: s.ats, boardToken: s.board_token,
      employeeBand: s.employee_band || "unknown", sizeSourceUrl: s.size_source_url || null,
    };
    if (existing) db.update(schema.companies).set(values).where(eq(schema.companies.id, existing.id)).run();
    else db.insert(schema.companies).values(values).run();
  }

  const all: RawPosting[] = [];
  const failedBoards: string[] = [];
  const queue = [...sources];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const s = queue.shift()!;
      try {
        const jobs = await fetchBoard(s, weights.fetch.max_details_per_board);
        fs.writeFileSync(path.join(RAW_DIR, `${slugify(s.company)}.json`), JSON.stringify(jobs));
        all.push(...jobs);
        console.log(`  ${s.company}: ${jobs.length} postings`);
      } catch (err) {
        failedBoards.push(s.company);
        console.warn(`  ${s.company}: fetch failed (${(err as Error).message})`);
      }
    }
  }));

  const manual = [...readManualPostings(), ...(await readManualUrls())];
  if (manual.length) console.log(`  manual imports: ${manual.length}`);
  for (const m of manual) {
    const slug = slugify(m.companyName);
    if (!db.select().from(schema.companies).where(eq(schema.companies.slug, slug)).get()) {
      db.insert(schema.companies).values({
        name: m.companyName, slug, domain: "", segment: "agent_native", ats: "manual", boardToken: "",
      }).run();
    }
  }
  all.push(...manual);

  // Stage 1 (code part) and scope rules. "screen" means the Claude
  // description screen decides in `npm run extract`.
  const cands: Candidate[] = [];
  for (const p of all) {
    const m = matchTitle(p.title);
    const hits = descriptionHits(p.text);
    const viaDescription = m.list === "ambiguous" || (m.list === "none" && hits.length >= roles.description_screen.min_hits);
    if (m.list === "none" && !viaDescription) continue;
    const titleList = viaDescription ? "screen" : m.list;
    let failReason: string | null = null;
    if (m.list === "drop") failReason = "title_drop_list";
    else if (weights.fetch.english_only && !isEnglish(p.text)) failReason = "not_english";
    else if (!locationInScope(p.locations, p.remote)) failReason = "out_of_scope_location";
    else {
      const age = ageInDays(p.postedAt, now);
      if (age !== null && age > maxAge) failReason = "too_old";
    }
    cands.push({
      ...p, titleList, failReason, normalizedTitle: normalizeTitle(p.title),
      stage1: { via: viaDescription ? "description" : "title", pattern: viaDescription ? null : m.pattern, prescreen_hits: hits, screen: null },
    });
  }
  const { kept, merged } = dedupe(cands);

  // Upsert postings; keep extraction when the text is unchanged.
  const companyBySlug = new Map(db.select().from(schema.companies).all().map((c) => [c.slug, c]));
  const fetchedCompanies = new Set<number>();
  const seenIds = new Set<string>();
  for (const c of kept) {
    const company = companyBySlug.get(slugify(c.companyName));
    if (!company) continue;
    fetchedCompanies.add(company.id);
    const id = postingId(c);
    seenIds.add(id);
    const textHash = sha256(c.text);
    const sal = salarySummary(c.salaries);
    const prev = db.select().from(schema.postings).where(eq(schema.postings.id, id)).get();
    // A posting already screened on its description keeps that decision
    // while its text is unchanged; anything else is (re)judged.
    const prevStage1 = prev?.titleCheck as Stage1 | null | undefined;
    const keepScreen = prev && prev.textHash === textHash && prevStage1?.via === "description" && prevStage1.screen && c.titleList === "screen";
    const titleList = keepScreen ? prev.titleList : c.titleList;
    const stage1 = keepScreen ? prevStage1 : c.stage1;
    const base = {
      companyId: company.id, title: c.title, normalizedTitle: c.normalizedTitle, url: c.url, ats: c.ats,
      sourceUrl: c.sourceUrl, rawText: c.text, textHash, postedAt: c.postedAt, fetchedAt: c.fetchedAt,
      locations: c.locations, salaries: c.salaries, titleList, titleCheck: stage1,
    };
    const unchanged = prev && prev.textHash === textHash && prev.titleList === titleList && !!prev.extractedAt;
    if (unchanged && !c.failReason) {
      // Same text, same stage-1 result: keep extraction and gate results.
      db.update(schema.postings).set({
        ...base,
        ...(sal.min ? { salaryMin: sal.min, salaryMax: sal.max, currency: sal.currency, salarySource: sal.source } : {}),
      }).where(eq(schema.postings.id, id)).run();
      continue;
    }
    // New, changed, re-judged or now out of scope: reset and re-run later.
    // The Claude cache makes re-extracting unchanged text free.
    if (prev) db.delete(schema.duties).where(eq(schema.duties.postingId, id)).run();
    const failReason = keepScreen && prev.failReason === "screen_not_main_job" ? prev.failReason : c.failReason;
    const row = {
      ...base, extractedAt: null, extraction: null, overlap: null, liveAgentStrength: null,
      passedGates: false, failReason, failDetail: null, agentType: null, isFirstEvalHire: null,
      salaryMin: sal.min, salaryMax: sal.max, currency: sal.currency, salarySource: sal.source,
    };
    if (prev) db.update(schema.postings).set(row).where(eq(schema.postings.id, id)).run();
    else db.insert(schema.postings).values({ id, ...row }).run();
  }

  // Exchange rates for non-USD salaries (European Central Bank via Frankfurter).
  try {
    const fx = await (await fetch("https://api.frankfurter.dev/v1/latest?base=USD", { signal: AbortSignal.timeout(15000) })).json() as { date: string; rates: Record<string, number> };
    if (fx?.rates) setMeta("fx", { date: fx.date, source: "https://api.frankfurter.dev (ECB reference rates)", rates: fx.rates });
  } catch {
    console.warn("  exchange rates unavailable; non-USD salaries stay out of cost");
  }

  // Remove postings that closed, but only for boards we fetched successfully.
  const failedIds = new Set(failedBoards.map((n) => companyBySlug.get(slugify(n))?.id));
  const stale = db.select({ id: schema.postings.id, companyId: schema.postings.companyId }).from(schema.postings).all()
    .filter((p) => !seenIds.has(p.id) && !failedIds.has(p.companyId))
    .map((p) => p.id);
  if (stale.length) {
    db.delete(schema.duties).where(inArray(schema.duties.postingId, stale)).run();
    db.delete(schema.triggers).where(inArray(schema.triggers.postingId, stale)).run();
    db.delete(schema.postings).where(inArray(schema.postings.id, stale)).run();
  }

  const counts = kept.reduce<Record<string, number>>((acc, c) => {
    const k = c.failReason ?? `to_extract:${c.titleList}`;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  setMeta("last_fetch", { at: now.toISOString(), boards: sources.length, failedBoards, postingsSeen: all.length, candidates: cands.length, merged, counts });
  console.log(`\nfetched ${all.length} postings from ${sources.length - failedBoards.length}/${sources.length} boards`);
  console.log(`stage-1 candidates: ${cands.length}, merged duplicates: ${merged}, removed closed: ${stale.length}`);
  console.log(counts);
}

main();
