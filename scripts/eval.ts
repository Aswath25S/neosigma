// npm run eval                 score extraction against data/eval/hand_labels.json
// npm run eval -- --template   write data/eval/to_label.json for 20 postings
//
// Hand labels are keyed by source span, not by duty index, so they survive
// re-extraction. Each hand-labelled duty is matched to the extracted duty
// whose span overlaps it most; the labels must then agree. A hand duty with
// no overlapping extracted duty counts as a miss.

import fs from "node:fs";
import path from "node:path";
import { getDb, schema } from "../src/lib/db/client";
import { findSpan } from "../src/lib/text";
import { setMeta } from "../src/lib/meta";

const DIR = path.join(process.cwd(), "data", "eval");
const LABELS = path.join(DIR, "hand_labels.json");

interface HandFile {
  labeller: string;
  method: string;
  postings: { posting_id: string; company: string; title: string; duties: { source_span: string; label: string; task_id: string | null }[] }[];
}

function template() {
  const db = getDb();
  const companies = new Map(db.select().from(schema.companies).all().map((c) => [c.id, c.name]));
  const extracted = db.select().from(schema.postings).all().filter((p) => p.extractedAt);
  // Mix of passed and failed postings, one per company where possible.
  const pick: typeof extracted = [];
  const seen = new Set<number>();
  for (const p of [...extracted.filter((p) => p.passedGates), ...extracted.filter((p) => !p.passedGates)]) {
    if (pick.length >= 20) break;
    if (seen.has(p.companyId) && extracted.length > 30) continue;
    seen.add(p.companyId);
    pick.push(p);
  }
  const duties = db.select().from(schema.duties).all();
  const out = pick.map((p) => ({
    posting_id: p.id,
    company: companies.get(p.companyId),
    title: p.title,
    text: p.rawText,
    // Spans only, no labels, so labelling is blind to the model's answer.
    duty_spans: duties.filter((d) => d.postingId === p.id).sort((a, b) => a.idx - b.idx).map((d) => d.sourceSpan),
  }));
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, "to_label.json"), JSON.stringify(out, null, 2));
  console.log(`wrote ${out.length} postings to data/eval/to_label.json`);
}

function score() {
  if (!fs.existsSync(LABELS)) {
    console.error("No data/eval/hand_labels.json yet. Run with --template, label, then re-run.");
    process.exit(1);
  }
  const hand = JSON.parse(fs.readFileSync(LABELS, "utf8")) as HandFile;
  const db = getDb();
  const postings = new Map(db.select().from(schema.postings).all().map((p) => [p.id, p]));
  const duties = db.select().from(schema.duties).all();
  let total = 0;
  let agree = 0;
  let missed = 0;
  let taskAgree = 0;
  let taskTotal = 0;
  const confusion: Record<string, number> = {};
  const perPosting: { posting_id: string; title: string; total: number; agree: number }[] = [];
  for (const hp of hand.postings) {
    const p = postings.get(hp.posting_id);
    if (!p) continue;
    const mine = duties.filter((d) => d.postingId === p.id && d.spanStart != null);
    let pa = 0;
    for (const hd of hp.duties) {
      total++;
      const span = findSpan(p.rawText, hd.source_span);
      const best = span
        ? mine
            .map((d) => ({ d, ov: Math.min(span.end, d.spanEnd!) - Math.max(span.start, d.spanStart!) }))
            .filter((x) => x.ov > 0)
            .sort((a, b) => b.ov - a.ov)[0]?.d
        : undefined;
      if (!best) {
        missed++;
        confusion[`${hd.label}→missing`] = (confusion[`${hd.label}→missing`] ?? 0) + 1;
        continue;
      }
      confusion[`${hd.label}→${best.label}`] = (confusion[`${hd.label}→${best.label}`] ?? 0) + 1;
      if (best.label === hd.label) {
        agree++;
        pa++;
        if (hd.label !== "not_covered") {
          taskTotal++;
          if (best.taskId === hd.task_id) taskAgree++;
        }
      }
    }
    perPosting.push({ posting_id: p.id, title: p.title, total: hp.duties.length, agree: pa });
  }
  const spanRows = db.select({ s: schema.duties.spanStart }).from(schema.duties).all();
  const result = {
    at: new Date().toISOString(),
    labeller: hand.labeller,
    method: hand.method,
    postings: perPosting.length,
    duties: total,
    agree,
    missed,
    accuracy: total ? agree / total : 0,
    taskAccuracy: taskTotal ? taskAgree / taskTotal : 0,
    spanFound: spanRows.filter((r) => r.s != null).length,
    spanTotal: spanRows.length,
    confusion,
    perPosting,
  };
  setMeta("eval", result);
  console.log(JSON.stringify({ ...result, perPosting: undefined }, null, 2));
  console.log(result.accuracy >= 0.85 ? "PASS: at least 85% of duty labels match." : "BELOW BAR: under 85% of duty labels match.");
}

if (process.argv.includes("--template")) template();
else score();
