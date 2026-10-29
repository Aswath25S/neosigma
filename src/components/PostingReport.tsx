import { PostingEvidence, type EvDuty, type EvQuote } from "./PostingEvidence";
import { DutySplit, ShareLegend } from "./ui";
import { money, pct } from "@/lib/format";
import { LIVE_STRENGTH_TEXT } from "@/lib/scoring";
import roles from "../../config/roles.json";

export interface ReportGates {
  titleList: string;
  titleNote?: string | null;
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
  failReason: string | null;
  failDetail: string | null;
  failText?: string | null;
}

export interface ReportData {
  company: string;
  companySlug?: string;
  title: string;
  url?: string;
  sourceUrl?: string;
  fetchedAt?: string;
  postedAt?: string | null;
  locations: string[];
  text: string;
  duties: EvDuty[];
  quotes: EvQuote[];
  droppedQuotes: string[];
  notLive: string[];
  fields: {
    seniority: string | null;
    agentType: string | null;
    tools: string[];
    pain: string[];
    volumeHint: string | null;
    firstEvalHire: { value: boolean; quote: string | null };
    remote: boolean | null;
    location: string | null;
  };
  salary: {
    min: number | null;
    max: number | null;
    currency: string | null;
    source: string | null;
    ranges: { min: number | null; max: number | null; currency: string | null; interval: string | null; location: string | null }[];
    // Middle of the posted range in USD (converted at the ECB rate if needed).
    midpoint?: number | null;
    converted?: boolean;
  };
  gates: ReportGates;
}

function Check({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  if (ok === null) return null;
  return (
    <div className="flex gap-3 py-3 border-b border-line last:border-b-0">
      <span className={`font-mono text-[12px] font-semibold w-12 shrink-0 ${ok ? "text-covered" : "text-assisted"}`}>{ok ? "PASS" : "FAIL"}</span>
      <div>
        <div className="text-ink text-[14px]">{label}</div>
        <div className="text-muted text-[13px]">{detail}</div>
      </div>
    </div>
  );
}

function Stat({ value, label, note }: { value: React.ReactNode; label: string; note: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <div className="font-display leading-none tracking-[-0.02em] text-ink">{value}</div>
      <div className="label mt-2">{label}</div>
      <div className="mt-2 text-[13px] text-muted leading-snug">{note}</div>
    </div>
  );
}

// `role` is the stored role breakdown page: it leaves out the filter checks and
// the extra stat boxes that the /try demo shows.
export function PostingReport({ data, ats, variant = "full" }: { data: ReportData; ats?: string; variant?: "full" | "role" }) {
  const full = variant === "full";
  const g = data.gates;
  const c = g.counts;
  const hasDuties = c.total > 0;
  const denom = Math.max(1, c.total - c.unclear);
  const s = data.salary;
  const salaryText = s.min != null
    ? `${money(s.min, { compact: true })}${s.max && s.max !== s.min ? `–${money(s.max, { compact: true }).replace("$", "")}` : ""}${s.currency && s.currency !== "USD" ? ` ${s.currency}` : ""}`
    : "Not stated";

  return (
    <div className="flex flex-col gap-8">
      {/* Summary strip */}
      <div className={`grid grid-cols-2 gap-4 ${full ? "md:grid-cols-4" : ""}`}>
        <Stat value={<span className="text-[44px]">{hasDuties ? pct(g.overlap) : "—"}</span>} label="Overlap"
          note={<>({c.covered} covered + 0.5 × {c.assisted} assisted) ÷ ({c.total} duties − {c.unclear} unclear)</>} />
        {full && <Stat value={<span className="text-[44px]">{hasDuties ? pct(c.covered / denom) : "—"}</span>} label="NeoSigma does it"
          note="Duties that are one of the six tasks done in a repeatable way" />}
        <Stat value={<span className="text-[30px]">{salaryText}</span>} label={`Salary (yearly)${s.ranges.length > 1 ? " · varies by location" : ""}`}
          note={s.min != null
            ? <>From the {s.source === "board" ? "job board" : "posting text"}{s.midpoint != null ? <>; midpoint {money(s.midpoint, { compact: true })}{s.converted ? " in USD" : ""}</> : ""}</>
            : "No salary in the posting"} />
        {full && <Stat value={<span className="text-[44px]">{g.liveAgentStrength}<span className="text-muted text-[22px]">/25</span></span>} label="Live agent proof"
          note={LIVE_STRENGTH_TEXT[g.liveAgentStrength] ?? ""} />}
      </div>

      {hasDuties && <DutySplit covered={c.covered} assisted={c.assisted} total={c.total} />}

      {/* Why it does or doesn't qualify */}
      <div className={`grid grid-cols-1 gap-4 ${full ? "lg:grid-cols-2" : ""} lg:items-start`}>
        {full && <div className={`rounded-[14px] border p-5 ${g.passed ? "border-[color-mix(in_srgb,var(--covered)_45%,transparent)] bg-[color-mix(in_srgb,var(--covered)_7%,var(--surface))]" : "border-line bg-surface"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
            <span className="label">Filter checks</span>
            <span className={`font-mono text-[12px] font-semibold ${g.passed ? "text-covered" : "text-assisted"}`}>{g.passed ? "QUALIFYING LEAD ROLE" : "NOT A LEAD"}</span>
          </div>
          {!g.passed && (g.failText || g.failDetail) && <p className="text-[14px] text-ink mt-1 mb-2">{g.failText} {g.failDetail && <span className="text-muted">{g.failDetail}</span>}</p>}
          <Check ok={g.titleList !== "drop" && g.titleList !== "screen"} label={`Stage 1: ${g.titleList === "screen" ? "screened out" : g.titleList}`} detail={g.titleNote ?? "Matched by the stage-1 title lists."} />
          {hasDuties && (
            <>
              <Check ok={g.stage2} label={`Stage 2: at least ${roles.stage2_min_covered_or_assisted} duties Covered or Assisted`} detail={`${c.covered + c.assisted} of ${c.total} duties.`} />
              <Check ok={g.conditional} label={`Conditional title: at least ${roles.conditional.min_distinct_tasks} of T1–T6`} detail={`Tasks present: ${g.distinctTasks.join(", ") || "none"}.`} />
              <Check ok={g.overlapGate} label={`Gate 1: at least ${Math.round(roles.gate_overlap_min_share * 100)}% of duties Covered or Assisted`} detail={`${pct(g.coveredOrAssistedShare)} of duties.`} />
              <Check ok={g.liveGate} label="Gate 2: an agent already used by real customers" detail={data.quotes.length ? `${data.quotes.length} verified quote${data.quotes.length > 1 ? "s" : ""}.` : "No verified quote."} />
            </>
          )}
        </div>}

        <div className="card card-pad">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <span className="label">Proof of a live agent</span>
            <span className="font-mono text-[12px] text-ink">{full ? `${g.liveAgentStrength} / 25 · ` : ""}{LIVE_STRENGTH_TEXT[g.liveAgentStrength] ?? ""}</span>
          </div>
          {data.quotes.length ? (
            <ul className="flex flex-col gap-2.5">
              {data.quotes.map((q, i) => (
                <li key={i} className="text-[15px]">
                  <a href={`#e${i}`} className="text-ink live-underline">“{q.quote}”</a>
                  <span className="label ml-2 !normal-case">{q.kind.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[14px] text-muted">No quote in the posting shows an agent already in front of real users.</p>}
          {data.notLive.length > 0 && <p className="text-[13px] text-muted mt-4">Signals of no live agent yet: {data.notLive.map((q) => `“${q}”`).join(", ")}</p>}
          {data.droppedQuotes.length > 0 && <p className="text-[13px] text-muted mt-2">Quotes not found word for word and ignored: {data.droppedQuotes.map((q) => `“${q}”`).join(", ")}</p>}
        </div>
      </div>

      {hasDuties ? (
        <div>
          <ShareLegend className="mb-4" />
          <PostingEvidence data={data} ats={ats} />
        </div>
      ) : (
        <div className="card card-pad whitespace-pre-wrap text-[15px] text-body">
          <span className="label block mb-4">Original posting · not read by Claude ({g.failText ?? "filtered out before extraction"})</span>
          {data.text}
        </div>
      )}
    </div>
  );
}
