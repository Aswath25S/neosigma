import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  domain: text("domain").notNull(),
  segment: text("segment").notNull(),
  employeeBand: text("employee_band").notNull().default("unknown"),
  sizeSourceUrl: text("size_source_url"),
  ats: text("ats").notNull(),
  boardToken: text("board_token").notNull(),
  // lead | rejected | no_roles
  status: text("status").notNull().default("no_roles"),
  leadScore: real("lead_score"),
  tier: text("tier"),
  scoreBreakdown: text("score_breakdown", { mode: "json" }),
  updatedAt: text("updated_at"),
});

export const postings = sqliteTable(
  "postings",
  {
    id: text("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    url: text("url").notNull(),
    ats: text("ats").notNull(),
    sourceUrl: text("source_url").notNull(),
    rawText: text("raw_text").notNull(),
    textHash: text("text_hash").notNull(),
    postedAt: text("posted_at"),
    fetchedAt: text("fetched_at").notNull(),
    locations: text("locations", { mode: "json" }).$type<string[]>().notNull(),
    // Every location's range is kept on the one record after dedupe.
    salaries: text("salaries", { mode: "json" }).notNull(),
    salaryMin: real("salary_min"),
    salaryMax: real("salary_max"),
    currency: text("currency"),
    salarySource: text("salary_source"),
    titleList: text("title_list").notNull(),
    titleCheck: text("title_check", { mode: "json" }),
    extractedAt: text("extracted_at"),
    extraction: text("extraction", { mode: "json" }),
    agentType: text("agent_type"),
    isFirstEvalHire: integer("is_first_eval_hire", { mode: "boolean" }),
    overlap: real("overlap"),
    liveAgentStrength: integer("live_agent_strength"),
    passedGates: integer("passed_gates", { mode: "boolean" }).notNull().default(false),
    failReason: text("fail_reason"),
    failDetail: text("fail_detail"),
    duplicateOf: text("duplicate_of"),
  },
  (t) => [index("postings_company").on(t.companyId)],
);

export const duties = sqliteTable(
  "duties",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postingId: text("posting_id").notNull().references(() => postings.id),
    idx: integer("idx").notNull(),
    text: text("text").notNull(),
    sourceSpan: text("source_span").notNull(),
    spanStart: integer("span_start"),
    spanEnd: integer("span_end"),
    label: text("label").notNull(),
    taskId: text("task_id"),
    notCoveredKind: text("not_covered_kind"),
    confidence: real("confidence").notNull(),
    rationale: text("rationale").notNull(),
    gapThemeId: integer("gap_theme_id"),
  },
  (t) => [index("duties_posting").on(t.postingId)],
);

export const triggers = sqliteTable("triggers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // null for triggers that apply to every lead (model releases)
  companyId: integer("company_id"),
  kind: text("kind").notNull(),
  points: integer("points").notNull(),
  date: text("date").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  source: text("source").notNull(),
  postingId: text("posting_id"),
  fetchedAt: text("fetched_at").notNull(),
});

export const gapThemes = sqliteTable("gap_themes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // possible_gap | human_work
  kind: text("kind").notNull(),
  description: text("description"),
  status: text("status").notNull().default("Unreviewed"),
  postingCount: integer("posting_count").notNull().default(0),
  companyCount: integer("company_count").notNull().default(0),
  hotWarmShare: real("hot_warm_share").notNull().default(0),
  hotWarmCompanies: integer("hot_warm_companies").notNull().default(0),
  exampleQuote: text("example_quote"),
  exampleDutyId: integer("example_duty_id"),
});

export const briefs = sqliteTable("briefs", {
  companyId: integer("company_id").primaryKey().references(() => companies.id),
  markdown: text("markdown").notNull(),
  content: text("content", { mode: "json" }).notNull(),
  draftMessage: text("draft_message").notNull(),
  generatedAt: text("generated_at").notNull(),
  model: text("model").notNull(),
  reviewed: integer("reviewed", { mode: "boolean" }).notNull().default(false),
});

export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }),
});
