import { PostingEvidence, type EvDuty, type EvQuote } from "./PostingEvidence";
import { DutySplit, ShareLegend } from "./ui";
import { money, pct } from "@/lib/format";
import { LIVE_STRENGTH_TEXT } from "@/lib/scoring";

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

function Stat({ value, label, note }: { value: React.ReactNode; label: string; note: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <div className="font-display leading-none tracking-[-0.02em] text-ink">{value}</div>
      <div className="label mt-2">{label}</div>
      <div className="mt-2 text-[13px] text-muted leading-snug">{note}</div>
    </div>
  );
}

export function PostingReport({ data, ats }: { data: ReportData; ats?: string }) {
  const g = data.gates;
  const c = g.counts;
  const hasDuties = c.total > 0;
  const s = data.salary;
  const salaryText = s.min != null
    ? `${money(s.min, { compact: true })}${s.max && s.max !== s.min ? `–${money(s.max, { compact: true }).replace("$", "")}` : ""}${s.currency && s.currency !== "USD" ? ` ${s.currency}` : ""}`
    : "Not stated";

  return (
    <div className="flex flex-col gap-8">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4">
        <Stat value={<span className="text-[44px]">{hasDuties ? pct(g.overlap) : "—"}</span>} label="Overlap"
          note={<>({c.covered} covered + 0.5 × {c.assisted} assisted) ÷ ({c.total} duties − {c.unclear} unclear)</>} />
        <Stat value={<span className="text-[30px]">{salaryText}</span>} label={`Salary (yearly)${s.ranges.length > 1 ? " · varies by location" : ""}`}
          note={s.min != null
            ? <>From the {s.source === "board" ? "job board" : "posting text"}{s.midpoint != null ? <>; midpoint {money(s.midpoint, { compact: true })}{s.converted ? " in USD" : ""}</> : ""}</>
            : "No salary in the posting"} />
      </div>

      {hasDuties && <DutySplit covered={c.covered} assisted={c.assisted} total={c.total} />}

      {/* Proof of a live agent */}
      <div>
        <div className="card card-pad">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <span className="label">Proof of a live agent</span>
            <span className="font-mono text-[12px] text-ink">{LIVE_STRENGTH_TEXT[g.liveAgentStrength] ?? ""}</span>
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
