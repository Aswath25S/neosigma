// npm run fetch
// Reads every board in config/sources.csv plus manual imports, keeps postings
// whose titles pass the stage-1 lists (or mention AI and need a Claude title
// check), applies the US/remote scope and 60-day cut-off, dedupes, and
// upserts into the database. Closed postings are removed.

import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/client";
import { fetchBoard } from "../src/lib/fetchers/boards";
import { readManualPostings, readManualUrls } from "../src/lib/fetchers/manual";
import type { RawPosting, SalaryRange } from "../src/lib/fetchers/types";
import { ageInDays, locationInScope, matchTitle } from "../src/lib/filters";
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
        const jobs = await fetchBoard(s);
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

  // Stage 1 (code part) and scope rules.
  const cands: Candidate[] = [];
  for (const p of all) {
    const m = matchTitle(p.title);
    if (m.list === "none") continue;
    let failReason: string | null = null;
    if (m.list === "drop") failReason = "title_drop_list";
    else if (!locationInScope(p.locations, p.remote)) failReason = "out_of_scope_location";
    else {
      const age = ageInDays(p.postedAt, now);
      if (age !== null && age > maxAge) failReason = "too_old";
    }
    cands.push({ ...p, titleList: m.list, failReason, normalizedTitle: normalizeTitle(p.title) });
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
    const base = {
      companyId: company.id, title: c.title, normalizedTitle: c.normalizedTitle, url: c.url, ats: c.ats,
      sourceUrl: c.sourceUrl, rawText: c.text, textHash, postedAt: c.postedAt, fetchedAt: c.fetchedAt,
      locations: c.locations, salaries: c.salaries, titleList: c.titleList,
    };
    if (prev && prev.textHash === textHash) {
      const keepGateResult = !c.failReason && prev.extractedAt;
      db.update(schema.postings).set({
        ...base,
        ...(keepGateResult ? {} : { failReason: c.failReason, passedGates: false }),
        ...(sal.min ? { salaryMin: sal.min, salaryMax: sal.max, currency: sal.currency, salarySource: sal.source } : {}),
      }).where(eq(schema.postings.id, id)).run();
    } else {
      if (prev) db.delete(schema.duties).where(eq(schema.duties.postingId, id)).run();
      const row = {
        ...base, titleCheck: null, extractedAt: null, extraction: null, overlap: null, liveAgentStrength: null,
        passedGates: false, failReason: c.failReason, failDetail: null,
        salaryMin: sal.min, salaryMax: sal.max, currency: sal.currency, salarySource: sal.source,
      };
      if (prev) db.update(schema.postings).set(row).where(eq(schema.postings.id, id)).run();
      else db.insert(schema.postings).values({ id, ...row }).run();
    }
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
