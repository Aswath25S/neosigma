import { eq, isNull, or, inArray } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { weights } from "./config";
import { getMeta } from "./meta";
import { mean, postedSalary, type Salary } from "./salary";
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

// ---- salaries ----

let salaryCache: { at: number; map: Map<string, Salary | null> } | null = null;

// Posted salary per posting, in USD. Nothing is estimated: a posting with no
// salary, or in a currency without an exchange rate, maps to null.
export function allSalaries(): Map<string, Salary | null> {
  if (salaryCache && Date.now() - salaryCache.at < 5000) return salaryCache.map;
  const fx = getMeta<{ rates: Record<string, number> }>("fx")?.rates ?? {};
  const map = new Map(db().select().from(schema.postings).all().map((p) => [p.id, postedSalary(p, fx)]));
  salaryCache = { at: Date.now(), map };
  return map;
}

export function avgSalary(postingIds: string[]): { avg: number | null; roles: number } {
  const all = allSalaries();
  const mids = postingIds.map((id) => all.get(id)).filter((s): s is Salary => !!s).map((s) => s.mid);
  return { avg: mean(mids), roles: mids.length };
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
  postings: LeadRole[];
  triggers: ScoreTrigger[];
  failReasons: string[];
  // For the row dropdown on the Leads page.
  bestQuote: { quote: string; postingId: string; idx: number } | null;
  taskWeights: Record<string, number>;
  domain: string;
  sizeSourceUrl: string | null;
  tools: string[];
  avgSalary: number | null;
  salaryRoles: number;
}

// One qualifying role as the Leads dropdown and case page list it.
export interface LeadRole {
  id: string;
  title: string;
  url: string;
  overlap: number;
  liveAgentStrength: number;
  agentType: string | null;
  hasSalary: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  salaryMid: number | null; // USD
  postedAt: string | null;
  counts: DutyCounts;
}

export interface DutyCounts {
  covered: number;
  assisted: number;
  total: number;
  unclear: number;
  // Bar shares: covered, and assisted at half weight, of (total − unclear),
  // so the bar ends at the overlap score.
  coveredShare: number;
  assistedShare: number;
}

export function dutyCounts(duties: { label: string; notCoveredKind: string | null }[]): DutyCounts {
  const covered = duties.filter((d) => d.label === "covered").length;
  const assisted = duties.filter((d) => d.label === "assisted").length;
  const unclear = duties.filter((d) => d.label === "not_covered" && d.notCoveredKind === "unclear").length;
  const denom = Math.max(1, duties.length - unclear);
  return { covered, assisted, total: duties.length, unclear, coveredShare: covered / denom, assistedShare: (0.5 * assisted) / denom };
}

export function getLeadRows(): { leads: LeadRow[]; rejectedPostings: (Posting & { companyName: string; companySlug: string })[] } {
  const companies = db().select().from(schema.companies).all();
  const postings = db().select().from(schema.postings).all();
  const triggers = db().select().from(schema.triggers).all();
  const global = triggers.filter((t) => t.companyId == null);
  const qualifyingIds = new Set(postings.filter((p) => p.passedGates).map((p) => p.id));
  const dutiesByPosting = new Map<string, DutyRow[]>();
  for (const d of db().select().from(schema.duties).all()) {
    if (!qualifyingIds.has(d.postingId)) continue;
    dutiesByPosting.set(d.postingId, [...(dutiesByPosting.get(d.postingId) ?? []), d]);
  }
  const leads: LeadRow[] = companies
    .filter((c) => c.status === "lead" || c.status === "rejected")
    .map((c) => {
      const mine = postings.filter((p) => p.companyId === c.id);
      const qualifying = mine.filter((p) => p.passedGates);
      const sal = allSalaries();
      const avg = avgSalary(qualifying.map((p) => p.id));
      return {
        id: c.id, name: c.name, slug: c.slug, segment: c.segment, employeeBand: c.employeeBand, status: c.status,
        leadScore: c.leadScore, tier: c.tier, breakdown: c.scoreBreakdown as Breakdown | null,
        postings: qualifying.sort((a, b) => (b.overlap ?? 0) - (a.overlap ?? 0)).map((p) => ({
          id: p.id, title: p.title, url: p.url, overlap: p.overlap ?? 0, liveAgentStrength: p.liveAgentStrength ?? 0,
          agentType: p.agentType, hasSalary: p.salaryMin != null, salaryMin: p.salaryMin, salaryMax: p.salaryMax,
          currency: p.currency, salaryMid: sal.get(p.id)?.mid ?? null, postedAt: p.postedAt,
          counts: dutyCounts(dutiesByPosting.get(p.id) ?? []),
        })),
        triggers: [...triggers.filter((t) => t.companyId === c.id), ...global].map((t) => ({
          id: t.id, kind: t.kind, date: t.date, title: t.title, url: t.url, source: t.source,
        })),
        bestQuote: (() => {
          // Strongest quote first: volume or named product, then any.
          const quotes = qualifying.flatMap((p) => (extractionOf(p)?.verified_evidence ?? []).map((e, idx) => ({ e, p, idx })));
          const q = quotes.find((x) => x.e.kind === "volume" || x.e.kind === "named_product") ?? quotes[0];
          return q ? { quote: q.e.quote, postingId: q.p.id, idx: q.idx } : null;
        })(),
        taskWeights: qualifying.flatMap((p) => dutiesByPosting.get(p.id) ?? []).reduce<Record<string, number>>((w, d) => {
          if (d.label !== "not_covered" && d.taskId) w[d.taskId] = (w[d.taskId] ?? 0) + (d.label === "covered" ? 1 : 0.5);
          return w;
        }, {}),
        failReasons: [...new Set(mine.map((p) => p.failReason).filter((x): x is string => !!x))],
        domain: c.domain,
        sizeSourceUrl: c.sizeSourceUrl,
        tools: [...new Set(qualifying.flatMap((p) => extractionOf(p)?.agent_tools ?? []))],
        avgSalary: avg.avg,
        salaryRoles: avg.roles,
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
    salaries: qualifying.map((p) => ({ postingId: p.id, title: p.title, salaryMin: p.salaryMin, salaryMax: p.salaryMax, currency: p.currency, salary: allSalaries().get(p.id) ?? null })),
  };
}

export type CompanyView = NonNullable<ReturnType<typeof getCompanyBySlug>>;

// ---- one posting ----

export function getPosting(id: string) {
  const posting = db().select().from(schema.postings).where(eq(schema.postings.id, id)).get();
  if (!posting) return null;
  const company = db().select().from(schema.companies).where(eq(schema.companies.id, posting.companyId)).get()!;
  const duties = db().select().from(schema.duties).where(eq(schema.duties.postingId, id)).all().sort((a, b) => a.idx - b.idx);
  const salary = allSalaries().get(id) ?? null;
  const themes = new Map(db().select().from(schema.gapThemes).all().map((t) => [t.id, t.name]));
  return { posting, company, duties, salary, themes };
}

// ---- gaps ----

export function getGaps() {
  const themes = db().select().from(schema.gapThemes).all();
  const allDuties = db().select({ d: schema.duties, title: schema.postings.title, companyId: schema.postings.companyId, passed: schema.postings.passedGates })
    .from(schema.duties).innerJoin(schema.postings, eq(schema.duties.postingId, schema.postings.id)).all();
  const totalByPosting = new Map<string, number>();
  for (const r of allDuties) totalByPosting.set(r.d.postingId, (totalByPosting.get(r.d.postingId) ?? 0) + 1);
  const duties = allDuties.filter((r) => r.d.gapThemeId != null);
  const companies = new Map(db().select().from(schema.companies).all().map((c) => [c.id, c]));
  const sal = allSalaries();
  // "Strong leads" are lead companies at or above the Warm threshold.
  const strongTotal = [...companies.values()].filter((c) => c.status === "lead" && (c.leadScore ?? 0) >= weights.tiers.warm).length;
  return {
    strongTotal,
    themes: themes
      .map((t) => {
        const mine = duties.filter((r) => r.d.gapThemeId === t.id);
        // Salary attached: each role's salary midpoint × the share of its duties
        // in this theme, summed over roles with a salary. Indicative only.
        const perPosting = new Map<string, number>();
        for (const r of mine) perPosting.set(r.d.postingId, (perPosting.get(r.d.postingId) ?? 0) + 1);
        let salaryAttached = 0;
        let salaryPostings = 0;
        for (const [pid, n] of perPosting) {
          const m = sal.get(pid)?.mid;
          if (m == null) continue;
          salaryAttached += m * (n / (totalByPosting.get(pid) ?? n));
          salaryPostings++;
        }
        return {
          ...t,
          salaryAttached,
          salaryPostings,
          duties: mine.map((r) => ({
            id: r.d.id, text: r.d.text, span: r.d.sourceSpan, postingId: r.d.postingId, idx: r.d.idx, title: r.title,
            company: companies.get(r.companyId)!, qualifying: r.passed,
          })),
          roles: [...new Set(mine.map((r) => r.title))],
        };
      })
      .sort((a, b) => b.hotWarmShare - a.hotWarmShare || b.postingCount - a.postingCount),
  };
}

// ---- headline numbers ----

export function getHeadline() {
  const { leads } = getLeadRows();
  const live = leads.filter((l) => l.status === "lead");
  const roles = live.reduce((s, l) => s + l.postings.length, 0);
  const ids = live.flatMap((l) => l.postings.map((p) => p.id));
  const avg = avgSalary(ids);
  const sal = allSalaries();
  const totalSalary = ids.reduce((s, id) => s + (sal.get(id)?.mid ?? 0), 0);
  return {
    totalSalary,
    companies: live.length,
    roles,
    avgSalary: avg.avg,
    salaryRoles: avg.roles,
    top: [...live].sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0)).slice(0, 10),
  };
}

export function companyName(id: number): string {
  return db().select().from(schema.companies).where(eq(schema.companies.id, id)).get()?.name ?? "";
}
