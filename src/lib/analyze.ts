import fs from "node:fs";
import path from "node:path";
import { coverageMap, MODELS, roles, weights, TASK_IDS } from "./config";
import { cached, structuredCall } from "./claude";
import { matchTitle, type TitleList } from "./filters";
import { ExtractionSchema, TitleCheckSchema, type Duty, type Extraction, type LiveEvidence, type TitleCheck } from "./schemas";
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

function titleCheckSystemPrompt(): string {
  return readPrompt("title_check.md")
    .replace("{{KEEP}}", roles.keep.titles.join("; "))
    .replace("{{CONDITIONAL}}", roles.conditional.titles.join("; "))
    .replace("{{DROP}}", roles.drop.titles.join("; "));
}

// ---------- stage 1: title ----------

export interface TitleResult {
  list: TitleList | "irrelevant";
  via: "pattern" | "claude";
  pattern: string | null;
  check: TitleCheck | null;
}

export async function classifyTitle(title: string, opts: { cache?: boolean } = {}): Promise<TitleResult | null> {
  const m = matchTitle(title);
  if (m.list === "none") return null;
  if (m.list !== "ambiguous") return { list: m.list, via: "pattern", pattern: m.pattern, check: null };
  const system = titleCheckSystemPrompt();
  const run = () =>
    structuredCall({
      model: MODELS.titleCheck,
      system,
      user: `Title: ${title}`,
      schema: TitleCheckSchema,
      effort: "low",
      maxTokens: 2000,
    });
  const check = opts.cache === false ? await run() : await cached("title", [MODELS.titleCheck, sha256(system), title], run);
  return { list: check.decision, via: "claude", pattern: null, check };
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
  title_irrelevant: "The title is not an AI quality role.",
  out_of_scope_location: "The role is outside the US and not remote from the US.",
  too_old: "The posting is older than 60 days.",
  stage2_too_few_duties: "Fewer than 3 duties are Covered or Assisted.",
  conditional_too_few_tasks: "A conditional title needs at least 3 of T1–T6 as Covered or Assisted.",
  gate_overlap: "Fewer than half of the duties are Covered or Assisted.",
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
    failDetail = `${coveredOrAssisted} of ${total} duties (${Math.round(share * 100)}%) are Covered or Assisted; at least half are needed.`;
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
