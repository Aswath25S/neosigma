import { z } from "zod";

// Every Claude output is validated against one of these before it is saved.
// Field order matters: the live demo shows progress chips as the streamed
// JSON reaches `duties`, then labels, then `live_agent_evidence`.

export const TaskIdEnum = z.enum(["T1", "T2", "T3", "T4", "T5", "T6"]);
export const LabelEnum = z.enum(["covered", "assisted", "not_covered"]);
export const NotCoveredKindEnum = z.enum(["human_work", "possible_gap", "unclear"]);
export const AgentTypeEnum = z.enum([
  "support", "voice", "coding", "research", "sales", "healthcare", "legal", "finance", "internal", "other",
]);

export const DutySchema = z.object({
  text: z.string().describe("One single duty, rewritten as a short plain sentence"),
  source_span: z.string().describe("Exact text copied from the posting that this duty came from"),
  label: LabelEnum,
  task_id: TaskIdEnum.nullable().describe("T1–T6, or null when not covered"),
  not_covered_kind: NotCoveredKindEnum.nullable().describe("Only when label is not_covered; otherwise null"),
  confidence: z.number().describe("0 to 1"),
  rationale: z.string().describe("One sentence on why"),
});

export const LiveEvidenceSchema = z.object({
  quote: z.string().describe("The shortest exact phrase from the posting that shows a live agent"),
  source_span: z.string().describe("The exact sentence or bullet from the posting containing the quote"),
  kind: z.enum(["in_production", "live_users", "volume", "named_product", "production_traces"]),
});

export const ExtractionSchema = z.object({
  company: z.string().nullable(),
  title: z.string(),
  seniority: z.enum(["intern", "junior", "mid", "senior", "staff", "principal", "manager", "director", "unknown"]),
  location: z.string().nullable(),
  remote: z.boolean().nullable(),
  posted_at: z.string().nullable().describe("YYYY-MM-DD if the posting text states it, else null"),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  currency: z.string().nullable(),
  salary_source: z.enum(["posting"]).nullable().describe("'posting' when the salary is stated in the text, else null"),
  agent_type: AgentTypeEnum.nullable(),
  agent_tools: z.array(z.string()),
  duties: z.array(DutySchema),
  live_agent_evidence: z.array(LiveEvidenceSchema),
  not_live_evidence: z.array(z.string()).describe("Exact quotes suggesting there is no live agent yet (prototype, first agent, exploring)"),
  volume_hint: z.string().nullable(),
  pain_phrases: z.array(z.string()),
  is_first_eval_hire: z.object({ value: z.boolean(), quote: z.string().nullable() }),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type Duty = z.infer<typeof DutySchema>;
export type LiveEvidence = z.infer<typeof LiveEvidenceSchema>;

export const TitleCheckSchema = z.object({
  decision: z.enum(["keep", "conditional", "drop", "irrelevant"]),
  closest_title: z.string().nullable().describe("The list title this one is closest to, or null"),
  reason: z.string(),
});
export type TitleCheck = z.infer<typeof TitleCheckSchema>;

export const NewsCheckSchema = z.object({
  items: z.array(z.object({
    index: z.number(),
    about_company: z.boolean(),
    kind: z.enum(["funding", "agent_launch", "acquisition", "public_complaints", "none"]),
    reason: z.string(),
  })),
});

export const ModelReleaseCheckSchema = z.object({
  items: z.array(z.object({
    index: z.number(),
    is_major_model_release: z.boolean(),
    model_name: z.string().nullable(),
  })),
});

export const ThemesSchema = z.object({
  themes: z.array(z.object({
    name: z.string().describe("Short plain theme name, 2–5 words"),
    description: z.string().describe("One sentence describing the work"),
    duty_ids: z.array(z.number()),
  })),
});

const Cited = z.object({
  text: z.string(),
  cites: z.array(z.string()).describe("Evidence ids from the input, e.g. P3, D12, E4, G2"),
});

export const BriefSchema = z.object({
  why_them: z.array(Cited),
  why_now: z.array(Cited),
  by_hand: z.array(Cited.extend({ task_id: TaskIdEnum })),
  proof: z.object({ text: z.string(), cites: z.array(z.string()) }),
  draft_message: z.string().describe("4–6 sentences, plain language"),
  draft_message_duty: z.string().describe("The D id of the duty the draft message references"),
  missing: z.array(z.string()).describe("Fields that were empty, stated plainly"),
});
export type Brief = z.infer<typeof BriefSchema>;

export const SizeSchema = z.object({
  employee_band: z.enum(["1-50", "51-200", "201-1000", "1001-5000", "5001+", "unknown"]),
  source_url: z.string().nullable(),
  evidence: z.string().nullable(),
});
