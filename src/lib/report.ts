import { applyGates, FAIL_REASON_TEXT, type FailReason, type Stage1, type VerifiedDuty } from "./analyze";
import type { ReportData } from "@/components/PostingReport";
import { extractionOf, type DutyRow, type Posting } from "./data";
import type { Midpoint } from "./cost";
import type { SalaryRange } from "./fetchers/types";

// Builds the evidence-page view of a stored posting. Gate results are
// recomputed from the stored duties so the page shows the same checks the
// pipeline ran.
export function reportFromStored(posting: Posting, companyName: string, companySlug: string, duties: DutyRow[], midpoint: Midpoint | null): ReportData {
  const ex = extractionOf(posting);
  const vDuties: VerifiedDuty[] = duties.map((d) => ({
    idx: d.idx, text: d.text, source_span: d.sourceSpan, label: d.label as VerifiedDuty["label"],
    task_id: d.taskId as VerifiedDuty["task_id"], not_covered_kind: d.notCoveredKind as VerifiedDuty["not_covered_kind"],
    confidence: d.confidence, rationale: d.rationale, span_start: d.spanStart, span_end: d.spanEnd,
  }));
  const evidence = ex?.verified_evidence ?? [];
  const list = posting.titleList === "keep" || posting.titleList === "conditional" ? posting.titleList : "keep";
  const g = applyGates(list, vDuties, evidence);
  const reason = posting.failReason as FailReason | null;
  const stage1 = posting.titleCheck as Stage1 | null;
  return {
    company: companyName,
    companySlug,
    title: posting.title,
    url: posting.url,
    sourceUrl: posting.sourceUrl,
    fetchedAt: posting.fetchedAt,
    postedAt: posting.postedAt,
    locations: posting.locations,
    text: posting.rawText,
    duties: duties.map((d) => ({
      idx: d.idx, text: d.text, sourceSpan: d.sourceSpan, spanStart: d.spanStart, spanEnd: d.spanEnd, label: d.label,
      taskId: d.taskId, notCoveredKind: d.notCoveredKind, confidence: d.confidence, rationale: d.rationale,
    })),
    quotes: evidence.map((e) => ({ quote: e.quote, kind: e.kind, span_start: e.span_start, span_end: e.span_end })),
    droppedQuotes: (ex?.dropped_evidence ?? []).map((e) => e.quote),
    notLive: ex?.not_live_evidence ?? [],
    fields: {
      seniority: ex?.seniority ?? null,
      agentType: posting.agentType,
      tools: ex?.agent_tools ?? [],
      pain: ex?.pain_phrases ?? [],
      volumeHint: ex?.volume_hint ?? null,
      firstEvalHire: ex?.is_first_eval_hire ?? { value: false, quote: null },
      remote: ex?.remote ?? null,
      location: ex?.location ?? null,
    },
    salary: {
      min: posting.salaryMin, max: posting.salaryMax, currency: posting.currency, source: posting.salarySource,
      ranges: (posting.salaries as SalaryRange[]) ?? [],
      midpointNote: midpoint?.estimated ? `Estimated midpoint ${Math.round(midpoint.value! / 1000)}k: ${midpoint.basis}.` : midpoint?.value == null ? `Cost not estimated: ${midpoint?.basis ?? "no salary"}.` : null,
    },
    gates: {
      ...g,
      titleList: posting.titleList,
      titleNote: stage1Note(stage1),
      passed: posting.passedGates,
      failReason: reason,
      failDetail: posting.failDetail ?? (reason ? null : g.failDetail),
      failText: reason ? FAIL_REASON_TEXT[reason] ?? reason : null,
    },
  };
}

export function stage1Note(s: Stage1 | null): string | null {
  if (!s) return null;
  const hits = s.prescreen_hits?.length ? ` Pre-screen matched ${s.prescreen_hits.length} duty phrases.` : "";
  if (s.via === "description" && s.screen) {
    return `Selected on its description. Claude screen: ${s.screen.decision} (${Math.round(s.screen.t1_t6_share * 100)}% of duties are T1–T6). ${s.screen.reason}${hits}`;
  }
  if (s.via === "description") return `Selected on its description; awaiting the Claude screen.${hits}`;
  return `Selected by its title on the stage-1 lists.${hits}`;
}
