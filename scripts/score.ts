// npm run score
// Computes every score in code from the extracted fields: posting-derived
// and manual triggers, the company lead score with its breakdown, tiers,
// and lead / rejected status. No Claude calls.

import { eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/client";
import { manualTriggers, weights } from "../src/lib/config";
import { scoreCompany } from "../src/lib/scoring";
import { refreshThemeStats } from "../src/lib/gapstats";
import { slugify } from "../src/lib/text";
import { setMeta } from "../src/lib/meta";

function main() {
  const db = getDb();
  const now = new Date();
  const fetchedAt = now.toISOString();
  const companies = db.select().from(schema.companies).all();
  const postings = db.select().from(schema.postings).all();

  // ---- Posting-derived and manual triggers ----
  db.delete(schema.triggers).where(inArray(schema.triggers.source, ["posting", "manual"])).run();
  for (const c of companies) {
    const qualifying = postings.filter((p) => p.companyId === c.id && p.passedGates);
    for (const p of qualifying.filter((p) => p.isFirstEvalHire)) {
      const quote = (p.extraction as { is_first_eval_hire?: { quote?: string | null } } | null)?.is_first_eval_hire?.quote;
      db.insert(schema.triggers).values({
        companyId: c.id, kind: "first_eval_hire", points: weights.timing.triggers.first_eval_hire,
        date: p.postedAt ?? p.fetchedAt, title: quote ? `${p.title}: “${quote}”` : `${p.title} is the first dedicated eval hire`,
        url: `/postings/${p.id}`, source: "posting", postingId: p.id, fetchedAt,
      }).run();
    }
    if (qualifying.length >= 2) {
      const latest = qualifying.map((p) => p.postedAt ?? p.fetchedAt).sort().at(-1)!;
      db.insert(schema.triggers).values({
        companyId: c.id, kind: "multiple_roles", points: weights.timing.triggers.multiple_roles,
        date: latest, title: `${qualifying.length} qualifying roles open at once`, url: `/companies/${c.slug}#roles`,
        source: "posting", fetchedAt,
      }).run();
    }
  }
  for (const t of manualTriggers.triggers as { company: string; kind: string; date: string; title: string; url: string }[]) {
    const c = companies.find((x) => x.slug === slugify(t.company));
    if (!c) continue;
    db.insert(schema.triggers).values({
      companyId: c.id, kind: t.kind, points: (weights.timing.triggers as Record<string, number>)[t.kind] ?? 0,
      date: new Date(t.date).toISOString(), title: t.title, url: t.url, source: "manual", fetchedAt,
    }).run();
  }

  // ---- Company scores ----
  const globalTriggers = db.select().from(schema.triggers).where(isNull(schema.triggers.companyId)).all();
  const tally = { lead: 0, rejected: 0, no_roles: 0, Hot: 0, Warm: 0, Watch: 0 };
  for (const c of companies) {
    const mine = postings.filter((p) => p.companyId === c.id);
    const qualifying = mine.filter((p) => p.passedGates);
    // A company with zero live-agent evidence is never a lead.
    const status = qualifying.length && qualifying.some((p) => (p.liveAgentStrength ?? 0) > 0)
      ? "lead"
      : mine.length ? "rejected" : "no_roles";
    tally[status]++;
    if (status !== "lead") {
      db.update(schema.companies).set({ status, leadScore: null, tier: null, scoreBreakdown: null, updatedAt: fetchedAt })
        .where(eq(schema.companies.id, c.id)).run();
      continue;
    }
    const triggers = [
      ...db.select().from(schema.triggers).where(eq(schema.triggers.companyId, c.id)).all(),
      ...globalTriggers,
    ];
    const b = scoreCompany({
      segment: c.segment,
      employeeBand: c.employeeBand,
      postings: qualifying.map((p) => ({ id: p.id, title: p.title, overlap: p.overlap ?? 0, liveAgentStrength: p.liveAgentStrength ?? 0 })),
      triggers: triggers.map((t) => ({ id: t.id, kind: t.kind, date: t.date, title: t.title, url: t.url, source: t.source })),
    }, weights, now);
    tally[b.tier]++;
    db.update(schema.companies).set({ status, leadScore: b.total, tier: b.tier, scoreBreakdown: b, updatedAt: fetchedAt })
      .where(eq(schema.companies.id, c.id)).run();
  }

  refreshThemeStats();
  setMeta("last_score", { at: fetchedAt, ...tally });
  console.log(tally);
}

main();
