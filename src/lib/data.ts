import { eq, isNull, or, inArray } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { weights } from "./config";
import { getMeta } from "./meta";
import { midpoints, yearlyCost, type Midpoint } from "./cost";
import type { Breakdown, ScoreTrigger } from "./scoring";
import type { VerifiedEvidence } from "./analyze";
import type { Brief } from "./schemas";

export type Company = typeof schema.companies.$inferSelect;
export type Posting = typeof schema.postings.$inferSelect;
export type DutyRow = typeof schema.duties.$inferSelect;
export type TriggerRow = typeof schema.triggers.$inferSelect;
export type GapTheme = typeof schema.gapThemes.$inferSelect;

export interface StoredExtraction {
  agent_tools: string[];
  pain_phrases: string[];
  volume_hint: string | null;
  seniority: string;
  location: string | null;
  remote: boolean | null;
  agent_type: string | null;
  verified_evidence: VerifiedEvidence[];
  dropped_evidence: { quote: string }[];
  not_live_evidence: string[];
  is_first_eval_hire: { value: boolean; quote: string | null };
  spans_found: number;
}

export function extractionOf(p: Posting): StoredExtraction | null {
  return (p.extraction as StoredExtraction | null) ?? null;
}

function db() {
  return getDb();
}

// ---- cost ----

let midpointCache: { at: number; map: Map<string, Midpoint> } | null = null;

export function allMidpoints(): Map<string, Midpoint> {
  if (midpointCache && Date.now() - midpointCache.at < 5000) return midpointCache.map;
  const rows = db().select().from(schema.postings).all().filter((p) => p.extractedAt);
  const map = midpoints(
    rows.map((p) => ({
      id: p.id, companyId: p.companyId, title: p.title, normalizedTitle: p.normalizedTitle,
      salaryMin: p.salaryMin, salaryMax: p.salaryMax, currency: p.currency, overlap: p.overlap ?? 0,
    })),
    weights.cost.min_same_title_postings,
    getMeta<{ rates: Record<string, number> }>("fx")?.rates ?? {},
  );
  midpointCache = { at: Date.now(), map };
  return map;
}

export interface RoleCost {
  postingId: string;
  title: string;
  overlap: number;
  midpoint: Midpoint;
  cost: number | null;
}

export function roleCosts(postings: Posting[], loadFactor = weights.cost.load_factor): RoleCost[] {
  const mids = allMidpoints();
  return postings.map((p) => {
    const m = mids.get(p.id) ?? { value: null, estimated: false, basis: "not extracted" };
    return {
      postingId: p.id, title: p.title, overlap: p.overlap ?? 0, midpoint: m,
      cost: m.value != null ? yearlyCost(m.value, loadFactor, p.overlap ?? 0) : null,
    };
  });
}

// ---- leads ----

export interface LeadRow {
  id: number;
  name: string;
  slug: string;
  segment: string;
  employeeBand: string;
  status: string;
  leadScore: number | null;
  tier: string | null;
  breakdown: Breakdown | null;
  postings: { id: string; title: string; overlap: number; liveAgentStrength: number; agentType: string | null; hasSalary: boolean }[];
  triggers: ScoreTrigger[];
  cost: number | null;
  costRoles: number;
  failReasons: string[];
}

export function getLeadRows(): { leads: LeadRow[]; rejectedPostings: (Posting & { companyName: string; companySlug: string })[] } {
  const companies = db().select().from(schema.companies).all();
  const postings = db().select().from(schema.postings).all();
  const triggers = db().select().from(schema.triggers).all();
  const global = triggers.filter((t) => t.companyId == null);
  const leads: LeadRow[] = companies
    .filter((c) => c.status === "lead" || c.status === "rejected")
    .map((c) => {
      const mine = postings.filter((p) => p.companyId === c.id);
      const qualifying = mine.filter((p) => p.passedGates);
      const costs = roleCosts(qualifying).filter((r) => r.cost != null);
      return {
        id: c.id, name: c.name, slug: c.slug, segment: c.segment, employeeBand: c.employeeBand, status: c.status,
        leadScore: c.leadScore, tier: c.tier, breakdown: c.scoreBreakdown as Breakdown | null,
        postings: qualifying.map((p) => ({
          id: p.id, title: p.title, overlap: p.overlap ?? 0, liveAgentStrength: p.liveAgentStrength ?? 0,
          agentType: p.agentType, hasSalary: p.salaryMin != null,
        })),
        triggers: [...triggers.filter((t) => t.companyId === c.id), ...global].map((t) => ({
          id: t.id, kind: t.kind, date: t.date, title: t.title, url: t.url, source: t.source,
        })),
        cost: costs.length ? costs.reduce((s, r) => s + r.cost!, 0) : null,
        costRoles: costs.length,
        failReasons: [...new Set(mine.map((p) => p.failReason).filter((x): x is string => !!x))],
      };
    });
  const bySlug = new Map(companies.map((c) => [c.id, c]));
  const rejectedPostings = postings
    .filter((p) => !p.passedGates && p.failReason)
    .map((p) => ({ ...p, companyName: bySlug.get(p.companyId)!.name, companySlug: bySlug.get(p.companyId)!.slug }));
  return { leads, rejectedPostings };
}

// ---- one company ----

export function getCompanyBySlug(slug: string) {
  const company = db().select().from(schema.companies).where(eq(schema.companies.slug, slug)).get();
  if (!company) return null;
  const postings = db().select().from(schema.postings).where(eq(schema.postings.companyId, company.id)).all();
  const qualifying = postings.filter((p) => p.passedGates).sort((a, b) => (b.overlap ?? 0) - (a.overlap ?? 0));
  const ids = postings.map((p) => p.id);
  const duties = ids.length ? db().select().from(schema.duties).where(inArray(schema.duties.postingId, ids)).all() : [];
  const triggers = db().select().from(schema.triggers)
    .where(or(eq(schema.triggers.companyId, company.id), isNull(schema.triggers.companyId))).all()
    .sort((a, b) => b.date.localeCompare(a.date));
  const brief = db().select().from(schema.briefs).where(eq(schema.briefs.companyId, company.id)).get() ?? null;
  const themeIds = [...new Set(duties.filter((d) => qualifying.some((p) => p.id === d.postingId)).map((d) => d.gapThemeId).filter((x): x is number => x != null))];
  const themes = themeIds.length ? db().select().from(schema.gapThemes).where(inArray(schema.gapThemes.id, themeIds)).all() : [];
  return {
    company,
    breakdown: company.scoreBreakdown as Breakdown | null,
    postings,
    qualifying,
    duties,
    triggers,
    brief: brief ? { ...brief, content: brief.content as Brief & { rendered?: unknown } } : null,
    themes,
    costs: roleCosts(qualifying),
  };
}

export type CompanyView = NonNullable<ReturnType<typeof getCompanyBySlug>>;

// ---- one posting ----

export function getPosting(id: string) {
  const posting = db().select().from(schema.postings).where(eq(schema.postings.id, id)).get();
  if (!posting) return null;
  const company = db().select().from(schema.companies).where(eq(schema.companies.id, posting.companyId)).get()!;
  const duties = db().select().from(schema.duties).where(eq(schema.duties.postingId, id)).all().sort((a, b) => a.idx - b.idx);
  const mid = allMidpoints().get(id) ?? null;
  return { posting, company, duties, midpoint: mid };
}

// ---- gaps ----

export function getGaps() {
  const themes = db().select().from(schema.gapThemes).all();
  const duties = db().select({ d: schema.duties, title: schema.postings.title, companyId: schema.postings.companyId, passed: schema.postings.passedGates })
    .from(schema.duties).innerJoin(schema.postings, eq(schema.duties.postingId, schema.postings.id)).all()
    .filter((r) => r.d.gapThemeId != null);
  const companies = new Map(db().select().from(schema.companies).all().map((c) => [c.id, c]));
  return themes
    .map((t) => {
      const mine = duties.filter((r) => r.d.gapThemeId === t.id);
      return {
        ...t,
        duties: mine.map((r) => ({
          id: r.d.id, text: r.d.text, span: r.d.sourceSpan, postingId: r.d.postingId, idx: r.d.idx, title: r.title,
          company: companies.get(r.companyId)!, qualifying: r.passed,
        })),
        roles: [...new Set(mine.map((r) => r.title))],
      };
    })
    .sort((a, b) => b.hotWarmShare - a.hotWarmShare || b.postingCount - a.postingCount);
}

// ---- headline numbers ----

export function getHeadline() {
  const { leads } = getLeadRows();
  const live = leads.filter((l) => l.status === "lead");
  const roles = live.reduce((s, l) => s + l.postings.length, 0);
  const cost = live.reduce((s, l) => s + (l.cost ?? 0), 0);
  // The "NEW" pill links the newest model-release or funding trigger.
  const newTrigger = db().select().from(schema.triggers).all()
    .filter((t) => t.kind === "model_release" || t.kind === "funding")
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  return {
    companies: live.length,
    hot: live.filter((l) => l.tier === "Hot").length,
    roles,
    cost,
    newTrigger,
    top: [...live].sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0)).slice(0, 6),
  };
}

export function companyName(id: number): string {
  return db().select().from(schema.companies).where(eq(schema.companies.id, id)).get()?.name ?? "";
}
