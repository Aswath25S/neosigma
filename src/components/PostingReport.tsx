import Link from "next/link";
import { PostingEvidence, type EvDuty, type EvQuote } from "./PostingEvidence";
import { OverlapBar, TaskLegend } from "./ui";
import { money, pct, shortDate } from "@/lib/format";
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
    midpointNote?: string | null;
  };
  gates: ReportGates;
}

function Check({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  if (ok === null) return null;
  return (
    <div className="flex gap-3 py-3 border-b border-line last:border-b-0">
      <span className={`mono !text-[12px] w-12 shrink-0 ${ok ? "text-covered" : "text-assisted"}`}>{ok ? "PASS" : "FAIL"}</span>
      <div>
        <div className="text-ink text-[14px]">{label}</div>
        <div className="text-muted text-[13px]">{detail}</div>
      </div>
    </div>
  );
}

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-line grid grid-cols-[130px_1fr] gap-3 text-[14px]">
      <div className="label !text-[10.5px] pt-0.5">{k}</div>
      <div className="text-body min-w-0 break-words">{children}</div>
    </div>
  );
}

export function PostingReport({ data }: { data: ReportData }) {
  const g = data.gates;
  const hasDuties = data.duties.length > 0;
  return (
    <div>
      {/* Verdict */}
      <div className="grid md:grid-cols-3 gap-4 mb-10">
        <div className="rounded-[14px] border border-line bg-surface p-5">
          <div className="label mb-2">Overlap</div>
          <div className="font-display text-[40px] leading-none text-ink">{hasDuties ? pct(g.overlap) : "—"}</div>
          <div className="text-[13px] text-muted mt-2">
            ({g.counts.covered} covered + 0.5 × {g.counts.assisted} assisted) ÷ ({g.counts.total} duties − {g.counts.unclear} unclear)
          </div>
          {hasDuties && <OverlapBar duties={data.duties} className="mt-4" />}
        </div>
        <div className="rounded-[14px] border border-line bg-surface p-5">
          <div className="label mb-2">Live-agent strength</div>
          <div className="font-display text-[40px] leading-none text-ink">{g.liveAgentStrength}<span className="text-muted text-[20px]"> / 25</span></div>
          <div className="text-[13px] text-muted mt-2">{LIVE_STRENGTH_TEXT[g.liveAgentStrength] ?? ""}</div>
          {data.quotes[0] && (
            <a href="#e0" className="block text-[13px] text-ink mt-3 live-underline">“{data.quotes[0].quote}”</a>
          )}
        </div>
        <div className={`rounded-[14px] border p-5 ${g.passed ? "border-[color-mix(in_srgb,var(--covered)_40%,transparent)] bg-[color-mix(in_srgb,var(--covered)_6%,var(--surface))]" : "border-line bg-surface"}`}>
          <div className="label mb-2">Result</div>
          <div className={`font-display text-[28px] leading-tight ${g.passed ? "text-covered" : "text-ink"}`}>{g.passed ? "Qualifying lead role" : "Not a lead"}</div>
          {!g.passed && (g.failText || g.failDetail) && (
            <p className="text-[14px] text-body mt-2">{g.failText} {g.failDetail && <span className="text-muted">{g.failDetail}</span>}</p>
          )}
        </div>
      </div>

      {hasDuties && (
        <section className="mb-12">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
            <h2 className="h-page !text-[28px]">The posting, duty by duty</h2>
            <TaskLegend />
          </div>
          <PostingEvidence text={data.text} duties={data.duties} quotes={data.quotes} />
        </section>
      )}
      {!hasDuties && (
        <section className="mb-12">
          <h2 className="h-page !text-[28px] mb-5">Posting text</h2>
          <div className="rounded-[14px] border border-line p-6 whitespace-pre-wrap text-[15px] text-body">{data.text}</div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-10">
        <section>
          <h3 className="label mb-3">Filter checks</h3>
          <div className="rounded-[14px] border border-line px-4">
            <Check ok={true} label={`Title list: ${g.titleList}`} detail={g.titleNote ?? "Matched by the stage-1 title lists."} />
            {hasDuties && (
              <>
                <Check ok={g.stage2} label="Stage 2: at least 3 duties Covered or Assisted" detail={`${g.counts.covered + g.counts.assisted} of ${g.counts.total} duties.`} />
                <Check ok={g.conditional} label="Conditional title: at least 3 of T1–T6" detail={`Tasks present: ${g.distinctTasks.join(", ") || "none"}.`} />
                <Check ok={g.overlapGate} label="Gate 1: at least half the duties Covered or Assisted" detail={`${pct(g.coveredOrAssistedShare)} of duties.`} />
                <Check ok={g.liveGate} label="Gate 2: an agent already used by real customers" detail={data.quotes.length ? `${data.quotes.length} verified quote${data.quotes.length > 1 ? "s" : ""}.` : "No verified quote."} />
              </>
            )}
          </div>

          <h3 className="label mt-8 mb-3">Live-agent evidence</h3>
          {data.quotes.length ? (
            <ul className="flex flex-col gap-2">
              {data.quotes.map((q, i) => (
                <li key={i}><a href={`#e${i}`} className="text-ink text-[14px] live-underline">“{q.quote}”</a> <span className="mono !text-[11px] text-muted ml-1">{q.kind.replace(/_/g, " ")}</span></li>
              ))}
            </ul>
          ) : <p className="text-[14px] text-muted">None found in the posting.</p>}
          {data.notLive.length > 0 && (
            <p className="text-[13px] text-muted mt-3">Signals of no live agent yet: {data.notLive.map((q) => `“${q}”`).join(", ")}</p>
          )}
          {data.droppedQuotes.length > 0 && (
            <p className="text-[13px] text-muted mt-2">Quotes not found verbatim and ignored: {data.droppedQuotes.map((q) => `“${q}”`).join(", ")}</p>
          )}
        </section>

        <section>
          <h3 className="label mb-3">Extracted fields</h3>
          <div>
            <Field k="Company">{data.companySlug ? <Link className="text-ink hover:underline" href={`/companies/${data.companySlug}`}>{data.company}</Link> : data.company}</Field>
            <Field k="Seniority">{data.fields.seniority ?? "—"}</Field>
            <Field k="Location">{data.locations.length ? data.locations.join(" · ") : data.fields.location ?? "—"}{data.fields.remote ? " (remote)" : ""}</Field>
            <Field k="Agent type">{data.fields.agentType ?? "—"}</Field>
            <Field k="Tools named">{data.fields.tools.length ? data.fields.tools.join(", ") : "None named"}</Field>
            <Field k="Volume">{data.fields.volumeHint ?? "—"}</Field>
            <Field k="Pain phrases">{data.fields.pain.length ? data.fields.pain.map((p) => `“${p}”`).join(", ") : "—"}</Field>
            <Field k="First eval hire">{data.fields.firstEvalHire.value ? `Yes · “${data.fields.firstEvalHire.quote}”` : "No"}</Field>
            <Field k="Salary">
              {data.salary.min != null ? `${money(data.salary.min)} – ${money(data.salary.max)} ${data.salary.currency ?? ""} (from ${data.salary.source === "board" ? "job board" : "posting text"})` : "Not stated"}
              {data.salary.ranges.length > 1 && (
                <ul className="mt-1 text-[13px] text-muted">
                  {data.salary.ranges.map((r, i) => <li key={i}>{r.location ?? "Range"}: {money(r.min)} – {money(r.max)} {r.currency}</li>)}
                </ul>
              )}
              {data.salary.midpointNote && <div className="text-[13px] text-muted mt-1">{data.salary.midpointNote}</div>}
            </Field>
            {data.postedAt !== undefined && <Field k="Posted">{shortDate(data.postedAt)}</Field>}
            {data.fetchedAt && <Field k="Fetched">{shortDate(data.fetchedAt)}</Field>}
            {data.url && <Field k="Source"><a className="text-ink hover:underline break-all" href={data.url} target="_blank" rel="noreferrer">{data.url}</a></Field>}
          </div>
        </section>
      </div>
    </div>
  );
}
