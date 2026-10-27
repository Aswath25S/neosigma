// npm run extract [-- --limit 20] [-- --force] [-- --ids a,b]
// Stage 1 (Claude title check for titles that only mention AI), then one
// extraction call per posting, span verification, stage 2 and the two gates.
// Claude results are cached by posting hash, so re-runs are cheap.

import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/client";
import { applyGates, classifyTitle, extractPosting } from "../src/lib/analyze";
import { hasApiKey } from "../src/lib/claude";
import { setMeta } from "../src/lib/meta";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const RED_TEAM = /\bred[\s-]*team/i;

async function main() {
  if (!hasApiKey()) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  const db = getDb();
  const limit = opt("limit") ? Number(opt("limit")) : Infinity;
  const ids = opt("ids")?.split(",");

  // ---- Stage 1, Claude part ----
  const ambiguous = db.select().from(schema.postings)
    .where(and(eq(schema.postings.titleList, "ambiguous"), isNull(schema.postings.failReason))).all();
  console.log(`title check: ${ambiguous.length} titles`);
  const titleQueue = [...ambiguous];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (titleQueue.length) {
      const p = titleQueue.shift()!;
      try {
        const r = await classifyTitle(p.title);
        if (!r) continue;
        const failReason = r.list === "drop" ? "title_drop_list" : r.list === "irrelevant" ? "title_irrelevant" : null;
        db.update(schema.postings).set({ titleList: r.list, titleCheck: r.check, failReason })
          .where(eq(schema.postings.id, p.id)).run();
        console.log(`  [${r.list}] ${p.title}`);
      } catch (err) {
        console.warn(`  title check failed for "${p.title}": ${(err as Error).message}`);
      }
    }
  }));

  // ---- Extraction ----
  let rows = db.select({ p: schema.postings, companyName: schema.companies.name })
    .from(schema.postings)
    .innerJoin(schema.companies, eq(schema.postings.companyId, schema.companies.id))
    .all()
    .filter(({ p }) =>
      (p.titleList === "keep" || p.titleList === "conditional") && !p.failReason?.startsWith("out_of") && p.failReason !== "too_old" ||
      (p.failReason === "title_drop_list" && RED_TEAM.test(p.title)))
    .filter(({ p }) => flag("force") || !p.extractedAt)
    .filter(({ p }) => !ids || ids.includes(p.id));
  // Strongest titles first so a --limit run covers the likeliest leads.
  rows.sort((a, b) => (a.p.titleList === "keep" ? 0 : 1) - (b.p.titleList === "keep" ? 0 : 1));
  rows = rows.slice(0, limit);
  console.log(`extraction: ${rows.length} postings`);

  let done = 0;
  let failed = 0;
  const queue = [...rows];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const { p, companyName } = queue.shift()!;
      const gapsOnly = p.failReason === "title_drop_list";
      try {
        const r = await extractPosting(p.rawText, p.title, companyName);
        const g = applyGates(p.titleList as "keep" | "conditional", r.duties, r.evidence);
        const ex = r.extraction;
        db.transaction((tx) => {
          tx.delete(schema.duties).where(eq(schema.duties.postingId, p.id)).run();
          if (r.duties.length) {
            tx.insert(schema.duties).values(r.duties.map((d) => ({
              postingId: p.id, idx: d.idx, text: d.text, sourceSpan: d.source_span,
              spanStart: d.span_start, spanEnd: d.span_end, label: d.label, taskId: d.task_id,
              notCoveredKind: d.not_covered_kind, confidence: d.confidence, rationale: d.rationale,
            }))).run();
          }
          const salaryFromPosting = !p.salaryMin && ex.salary_min ? {
            salaryMin: ex.salary_min, salaryMax: ex.salary_max ?? ex.salary_min,
            currency: ex.currency ?? "USD", salarySource: "posting",
          } : {};
          tx.update(schema.postings).set({
            extractedAt: new Date().toISOString(),
            extraction: { ...ex, verified_evidence: r.evidence, dropped_evidence: r.droppedEvidence, spans_found: r.spansFound },
            agentType: ex.agent_type,
            isFirstEvalHire: ex.is_first_eval_hire.value,
            overlap: g.overlap,
            liveAgentStrength: g.liveAgentStrength,
            passedGates: gapsOnly ? false : g.passed,
            failReason: gapsOnly ? "title_drop_list" : g.failReason,
            failDetail: gapsOnly ? "Red-team role: duties kept for the gaps view only." : g.failDetail,
            ...salaryFromPosting,
          }).where(eq(schema.postings.id, p.id)).run();
        });
        done++;
        const mark = g.passed && !gapsOnly ? "PASS" : g.failReason;
        console.log(`  ${mark?.padEnd(24)} ${Math.round(g.overlap * 100)}% ${companyName} — ${p.title} (${r.spansFound}/${r.duties.length} spans)`);
      } catch (err) {
        // Left un-extracted so the next run retries it.
        failed++;
        console.warn(`  extraction failed for ${companyName} — ${p.title}: ${(err as Error).message}`);
      }
    }
  }));

  // Span accuracy across everything extracted so far (shown on the Method page).
  const allDuties = db.select({ s: schema.duties.spanStart }).from(schema.duties).all();
  const found = allDuties.filter((d) => d.s !== null).length;
  setMeta("span_check", { duties: allDuties.length, found, at: new Date().toISOString() });
  setMeta("last_extract", { at: new Date().toISOString(), done, failed });
  console.log(`\nextracted ${done}, failed ${failed}; spans found verbatim: ${found}/${allDuties.length}`);
}

main();
