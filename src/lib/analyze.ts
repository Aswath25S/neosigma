import fs from "node:fs";
import path from "node:path";
import { coverageMap, MODELS, roles, weights, TASK_IDS } from "./config";
import { cached, structuredCall } from "./claude";
import { descriptionHits, matchTitle, type TitleList } from "./filters";
import { ExtractionSchema, ScreenSchema, type Duty, type Extraction, type LiveEvidence, type Screen } from "./schemas";
import { findSpan, sha256 } from "./text";

// ---------- prompts ----------

function readPrompt(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "prompts", name), "utf8");
}

function coverageMapText(): string {
  return coverageMap.tasks
    .map((t) => `- **${t.id}: ${t.does}.** Done by hand: ${t.by_hand}. Typical phrasing: ${t.phrasing.map((p) => `"${p}"`).join(", ")}.`)
    .join("\n");
}

export function extractionSystemPrompt(): string {
  return readPrompt("extract.md").replace("{{COVERAGE_MAP}}", coverageMapText());
}

// ---------- stage 1: description screen ----------

function screenSystemPrompt(): string {
  return readPrompt("screen.md").replace("{{COVERAGE_MAP}}", coverageMapText());
}

const SCREEN_CHARS = 8000;

export async function screenDescription(title: string, text: string, opts: { cache?: boolean } = {}): Promise<Screen> {
  const system = screenSystemPrompt();
  const user = `Title: ${title || "unknown"}\n\n<posting>\n${text.slice(0, SCREEN_CHARS)}\n</posting>`;
  const run = () => structuredCall({ model: MODELS.screen, system, user, schema: ScreenSchema, effort: "low", maxTokens: 4000 });
  const r = opts.cache === false ? await run() : await cached("screen", [MODELS.screen, sha256(system), user], run);
  return { ...r, t1_t6_share: Math.max(0, Math.min(1, r.t1_t6_share)) };
}

// How a posting entered the pipeline and what stage 1 decided. Stored in
// postings.title_check.
export interface Stage1 {
  via: "title" | "description";
  pattern: string | null;
  prescreen_hits: string[];
  screen: Screen | null;
}

// Stage 1 as the live demo runs it: Drop-list titles are dropped and
// keep/conditional titles pass; every other posting is judged on its
// description by Claude.
export async function judgePosting(title: string, text: string, opts: { cache?: boolean } = {}): Promise<{ list: TitleList; stage1: Stage1 }> {
  const m = matchTitle(title);
  const hits = descriptionHits(text);
  if (m.list === "keep" || m.list === "conditional" || m.list === "drop") {
    return { list: m.list, stage1: { via: "title", pattern: m.pattern, prescreen_hits: hits, screen: null } };
  }
  const screen = await screenDescription(title, text, opts);
  return { list: screen.decision, stage1: { via: "description", pattern: null, prescreen_hits: hits, screen } };
}

// ---------- extraction ----------

export interface VerifiedDuty extends Duty {
  idx: number;
  span_start: number | null;
  span_end: number | null;
}

export interface VerifiedEvidence extends LiveEvidence {
  span_start: number;
  span_end: number;
}

export interface ExtractResult {
  extraction: Extraction;
  duties: VerifiedDuty[];
  evidence: VerifiedEvidence[];
  droppedEvidence: LiveEvidence[];
  spansFound: number;
}

export function extractionCacheKey(text: string, title: string, company: string): string[] {
  return [MODELS.extract, sha256(extractionSystemPrompt()), company, title, text];
}

export function buildUserMessage(text: string, title: string, company: string): string {
  return `Company: ${company || "unknown"}\nTitle: ${title || "unknown"}\n\nPosting text:\n<posting>\n${text}\n</posting>`;
}

export async function extractPosting(
  text: string,
  title: string,
  company: string,
  opts: { cache?: boolean; effort?: "low" | "medium" | "high"; onText?: (s: string) => void } = {},
): Promise<ExtractResult> {
  const run = () =>
    structuredCall({
      model: MODELS.extract,
      system: extractionSystemPrompt(),
      user: buildUserMessage(text, title, company),
      schema: ExtractionSchema,
      effort: opts.effort ?? "medium",
      maxTokens: 32000,
      onText: opts.onText,
    });
  const extraction = opts.cache === false ? await run() : await cached("extract", extractionCacheKey(text, title, company), run);
  return verify(extraction, text);
}

// Checks every quoted span against the posting text. Duties whose span is not
// found are kept but never highlighted; live-agent quotes that are not found
// are dropped, so they can't pass the live-agent gate.
export function verify(extraction: Extraction, text: string): ExtractResult {
  let spansFound = 0;
  const duties: VerifiedDuty[] = extraction.duties.map((d, idx) => {
    const span = findSpan(text, d.source_span);
    if (span) spansFound++;
    const label = d.label;
    return {
      ...d,
      idx,
      confidence: Math.max(0, Math.min(1, d.confidence)),
      task_id: label === "not_covered" ? null : d.task_id,
      not_covered_kind: label === "not_covered" ? (d.not_covered_kind ?? "unclear") : null,
      span_start: span?.start ?? null,
      span_end: span?.end ?? null,
    };
  });
  const evidence: VerifiedEvidence[] = [];
  const droppedEvidence: LiveEvidence[] = [];
  for (const e of extraction.live_agent_evidence) {
    const span = findSpan(text, e.source_span) ?? findSpan(text, e.quote);
    if (span && findSpan(text, e.quote)) evidence.push({ ...e, span_start: span.start, span_end: span.end });
    else droppedEvidence.push(e);
  }
  return { extraction, duties, evidence, droppedEvidence, spansFound };
}

// ---------- gates ----------

export type FailReason =
  | "title_drop_list"
  | "screen_not_main_job"
  | "not_english"
  | "title_irrelevant"
  | "out_of_scope_location"
  | "too_old"
  | "stage2_too_few_duties"
  | "conditional_too_few_tasks"
  | "gate_overlap"
  | "gate_live_agent"
  | "extraction_error";

export const FAIL_REASON_TEXT: Record<FailReason, string> = {
  title_drop_list: "The title is on the Drop list.",
  screen_not_main_job: "The description shows the role's main job is not NeoSigma's work.",
  not_english: "The posting is not in English.",
  title_irrelevant: "The title is not an AI quality role.",
  out_of_scope_location: "The role is outside the regions in scope.",
  too_old: `The posting is older than ${weights.fetch.max_posting_age_days} days.`,
  stage2_too_few_duties: "Fewer than 3 duties are Covered or Assisted.",
  conditional_too_few_tasks: `A conditional title needs at least ${roles.conditional.min_distinct_tasks} of T1–T6 as Covered or Assisted.`,
  gate_overlap: `Fewer than ${Math.round(roles.gate_overlap_min_share * 100)}% of the duties are Covered or Assisted.`,
  gate_live_agent: "The posting shows no agent already used by real customers or users.",
  extraction_error: "The posting could not be read.",
};

export interface GateResult {
  counts: { covered: number; assisted: number; notCovered: number; unclear: number; total: number };
  distinctTasks: string[];
  overlap: number;
  coveredOrAssistedShare: number;
  liveAgentStrength: number;
  stage2: boolean;
  conditional: boolean | null;
  overlapGate: boolean;
  liveGate: boolean;
  passed: boolean;
  failReason: FailReason | null;
  failDetail: string | null;
}

// overlap = (covered + 0.5 × assisted) ÷ (all duties − unclear)
export function computeOverlap(duties: Pick<Duty, "label" | "not_covered_kind">[]): number {
  const covered = duties.filter((d) => d.label === "covered").length;
  const assisted = duties.filter((d) => d.label === "assisted").length;
  const unclear = duties.filter((d) => d.label === "not_covered" && d.not_covered_kind === "unclear").length;
  const denom = duties.length - unclear;
  return denom > 0 ? (covered + 0.5 * assisted) / denom : 0;
}

// 0 = no evidence, 15 = an "in production" style quote, 25 = a volume number
// or a named agent product.
export function liveAgentStrength(evidence: Pick<LiveEvidence, "kind">[]): number {
  const p = weights.live_agent_points;
  if (!evidence.length) return p.none;
  if (evidence.some((e) => e.kind === "volume" || e.kind === "named_product")) return p.volume_or_named_product;
  return p.in_production;
}

export function applyGates(titleList: TitleList | "irrelevant", duties: VerifiedDuty[], evidence: VerifiedEvidence[]): GateResult {
  const covered = duties.filter((d) => d.label === "covered").length;
  const assisted = duties.filter((d) => d.label === "assisted").length;
  const unclear = duties.filter((d) => d.label === "not_covered" && d.not_covered_kind === "unclear").length;
  const total = duties.length;
  const distinctTasks = TASK_IDS.filter((t) => duties.some((d) => d.label !== "not_covered" && d.task_id === t));
  const coveredOrAssisted = covered + assisted;
  const share = total ? coveredOrAssisted / total : 0;
  const strength = liveAgentStrength(evidence);

  const stage2 = coveredOrAssisted >= roles.stage2_min_covered_or_assisted;
  const conditional = titleList === "conditional" ? distinctTasks.length >= roles.conditional.min_distinct_tasks : null;
  const overlapGate = share >= roles.gate_overlap_min_share;
  const liveGate = evidence.length > 0;

  let failReason: FailReason | null = null;
  let failDetail: string | null = null;
  if (!stage2) {
    failReason = "stage2_too_few_duties";
    failDetail = `${coveredOrAssisted} of ${total} duties are Covered or Assisted; at least ${roles.stage2_min_covered_or_assisted} are needed.`;
  } else if (conditional === false) {
    failReason = "conditional_too_few_tasks";
    failDetail = `Only ${distinctTasks.length} of T1–T6 appear (${distinctTasks.join(", ") || "none"}); a conditional title needs ${roles.conditional.min_distinct_tasks}.`;
  } else if (!overlapGate) {
    failReason = "gate_overlap";
    failDetail = `${coveredOrAssisted} of ${total} duties (${Math.round(share * 100)}%) are Covered or Assisted; at least ${Math.round(roles.gate_overlap_min_share * 100)}% are needed.`;
  } else if (!liveGate) {
    failReason = "gate_live_agent";
    failDetail = "No quote in the posting shows an agent already used by real customers or users.";
  }

  return {
    counts: { covered, assisted, notCovered: total - coveredOrAssisted, unclear, total },
    distinctTasks,
    overlap: computeOverlap(duties),
    coveredOrAssistedShare: share,
    liveAgentStrength: strength,
    stage2,
    conditional,
    overlapGate,
    liveGate,
    passed: failReason === null,
    failReason,
    failDetail,
  };
}
