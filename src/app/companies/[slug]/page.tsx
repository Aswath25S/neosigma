import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCompanyBySlug, extractionOf, dutyCounts, getLeadRows, type DutyRow } from "@/lib/data";
import { coverageMap, segmentName, TASK_IDS } from "@/lib/config";
import { activeTriggers, DEFAULT_WEIGHTS, LIVE_STRENGTH_TEXT, TRIGGER_NAMES } from "@/lib/scoring";
import { pickProof, type RenderedBrief, type Ref } from "@/lib/brief";
import { money, pct, shortDate } from "@/lib/format";
import { CopyButton } from "@/components/CopyButton";
import { BackLink } from "@/components/BackLink";
import { Disclosure } from "@/components/Disclosure";
import { EmptyState, LabelChip, Note, Section, ShareBar, ShareLegend, StatBlock, TierChip } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const v = getCompanyBySlug(slug);
  return { title: v?.company.name ?? "Company" };
}

const PROOF_SHORT: Record<string, string> = {
  verification: "Verification",
  self_improvement: "Self-improvement",
  scaffolding_tax: "Scaffolding Tax",
};

function Cites({ ids, refs }: { ids: string[]; refs: Record<string, Ref> }) {
  return (
    <span className="whitespace-nowrap">
      {ids.map((id) => {
        const r = refs[id];
        if (!r) return null;
        return (
          <a key={id} href={r.href} target={r.external ? "_blank" : undefined} rel="noreferrer" title={r.label}
            className="ml-1.5 align-[2px] font-mono text-[10.5px] text-muted border border-line-strong rounded-full px-1.5 py-px hover:text-ink hover:border-muted">
            {id}
          </a>
        );
      })}
    </span>
  );
}

function BriefCard({ title, items, refs, empty, wide = false }: { title: string; items: { text: string; cites: string[]; task_id?: string }[]; refs: Record<string, Ref>; empty: string; wide?: boolean }) {
  return (
    <div className={`rounded-[14px] border border-line bg-surface p-5 ${wide ? "md:col-span-2" : ""}`}>
      <span className="label">{title}</span>
      <div className="mt-3 flex flex-col gap-2.5 text-[16px] leading-relaxed text-body">
        {items.length ? items.map((s, i) => (
          <p key={i}>{s.task_id && <span className="font-mono text-[12px] text-covered mr-2">{s.task_id}</span>}{s.text}<Cites ids={s.cites} refs={refs} /></p>
        )) : <p className="text-muted">{empty}</p>}
      </div>
    </div>
  );
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = getCompanyBySlug(slug);
  if (!v) notFound();
  const { company, qualifying, duties, breakdown, brief, themes, costs } = v;
  const isLead = company.status === "lead" && !!breakdown;
  const rendered = brief?.content as unknown as RenderedBrief | undefined;
  const refs = rendered?.refs ?? {};

  const leadRanks = getLeadRows().leads.filter((l) => l.status === "lead").sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0));
  const rank = leadRanks.findIndex((l) => l.slug === company.slug) + 1;

  const byPosting = new Map<string, DutyRow[]>();
  for (const d of duties) byPosting.set(d.postingId, [...(byPosting.get(d.postingId) ?? []), d]);
  const qualIds = new Set(qualifying.map((p) => p.id));
  const qualDuties = duties.filter((d) => qualIds.has(d.postingId));

  // Task split: covered and assisted duties per task across qualifying roles.
  const split = TASK_IDS.map((t) => ({
    t,
    covered: qualDuties.filter((d) => d.taskId === t && d.label === "covered").length,
    assisted: qualDuties.filter((d) => d.taskId === t && d.label === "assisted").length,
  }));
  const taskWeights = Object.fromEntries(split.map((x) => [x.t, x.covered + 0.5 * x.assisted]));
  const proofKey = rendered?.proofKey ?? pickProof(taskWeights);
  const proof = coverageMap.proofs[proofKey];
  const maxSplit = Math.max(1, ...split.map((x) => x.covered + x.assisted));

  const allActive = activeTriggers(v.triggers.map((t) => ({ id: t.id, kind: t.kind, date: t.date, title: t.title, url: t.url, source: t.source })), DEFAULT_WEIGHTS, new Date());
  const newestRelease = allActive.filter((t) => t.kind === "model_release").sort((a, b) => b.date.localeCompare(a.date))[0];
  const active = allActive.filter((t) => t.kind !== "model_release" || t === newestRelease);

  const tools = [...new Set(qualifying.flatMap((p) => extractionOf(p)?.agent_tools ?? []))];
  const totalCost = costs.reduce((s, c) => s + (c.cost ?? 0), 0);
  const costCount = costs.filter((c) => c.cost != null).length;
  const best = qualifying[0];
  const bestQuote = qualifying.map((p) => ({ p, e: extractionOf(p)?.verified_evidence?.[0] })).find((x) => x.e);
  const otherPostings = v.postings.filter((p) => !p.passedGates);

  const headline = isLead
    ? `${company.name} is hiring ${qualifying.length} ${qualifying.length === 1 ? "role" : "roles"} for NeoSigma's work, the best at ${pct(breakdown!.overlap.bestOverlap)} overlap.`
    : `No role at ${company.name} passed both gates.`;

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      {/* Hero */}
      <div className="pt-10 sm:pt-14 pb-12 flex flex-col gap-5">
        <div><BackLink href="/leads" label="All lead companies" /></div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="label">The case</span>
          <span className="mono text-muted">
            {company.name} · <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="hover:text-ink">{company.domain} ↗</a>
            {rank ? ` · rank ${rank} of ${leadRanks.length}` : ""} · {segmentName(company.segment)}
          </span>
          <TierChip tier={isLead ? company.tier : null} />
        </div>
        <h1 className="display !text-[clamp(32px,5vw,52px)] max-w-[1100px]">{headline}</h1>
        {!isLead && (
          <p className="max-w-[900px] text-[15px] text-body">
            {otherPostings.length ? "Every role checked is listed below with the reason it was not a lead." : "No AI quality roles were found on its board."}
          </p>
        )}
      </div>

      {isLead && (
        <>
          {/* Stat strip */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 pb-14">
            <StatBlock value={Math.round(breakdown!.total)} label="Lead score" href="#score" note="Out of 100. See the breakdown below." />
            <StatBlock value={pct(breakdown!.overlap.bestOverlap)} label="Best overlap" href="#roles" note={`${qualifying.length} qualifying ${qualifying.length === 1 ? "role" : "roles"}`} />
            <StatBlock value={`${breakdown!.live.strength}/25`} label="Agent already live" href="#roles" note={LIVE_STRENGTH_TEXT[breakdown!.live.strength]} />
            <StatBlock value={costCount ? money(totalCost, { compact: true }) : "–"} label="Manual work a year" href="#cost" note={costCount ? `${costCount} of ${costs.length} roles list a salary` : "No salary posted"} />
            <StatBlock value={<span className="block text-[18px] sm:text-[24px] leading-tight [overflow-wrap:normal] [word-break:keep-all]">{PROOF_SHORT[proofKey]}</span>} label="Lead with" href="#tasks" note={proof.name} />
          </div>

          {/* Brief */}
          <Section id="brief" num="01" eyebrow="The brief" title="Why them, and what to say.">
            {rendered ? (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <BriefCard title="Why them" items={rendered.brief.why_them} refs={refs} empty="No qualifying evidence stored." />
                  <BriefCard title="Why now" items={rendered.brief.why_now} refs={refs} empty="No active triggers in the last 90 days." />
                  <BriefCard title="What they're doing by hand" items={rendered.brief.by_hand} refs={refs} empty="No covered duties stored." />
                  <BriefCard title={`Lead with: ${proof.name}`} items={rendered.brief.proof.text ? [rendered.brief.proof] : []} refs={refs} empty={proof.claim} />
                  <div className="rounded-[14px] border border-line bg-surface p-5 md:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="label">Draft opening message</span>
                      <CopyButton text={brief!.draftMessage} label="Copy message" />
                    </div>
                    <p className="mt-3 text-[16.5px] text-ink whitespace-pre-wrap leading-[1.7] max-w-[900px]">{brief!.draftMessage}</p>
                    {rendered.brief.draft_message_duty && refs[rendered.brief.draft_message_duty] && (
                      <Link href={refs[rendered.brief.draft_message_duty].href} className="mono !text-[12px] text-muted hover:text-ink mt-3 inline-block">
                        References “{refs[rendered.brief.draft_message_duty].label.slice(0, 90)}{refs[rendered.brief.draft_message_duty].label.length > 90 ? "…" : ""}” →
                      </Link>
                    )}
                    <p className="mono !text-[11px] text-muted mt-3">Draft only. Nothing is sent from this app; a person reviews and sends.</p>
                  </div>
                  {rendered.brief.missing.length > 0 && (
                    <BriefCard wide title="Missing data" items={rendered.brief.missing.map((m) => ({ text: m, cites: [] }))} refs={refs} empty="" />
                  )}
                </div>
                <div className="mt-4">
                  <Note>Written by {brief!.model} on {shortDate(brief!.generatedAt)} from the stored data on this page only. Every sentence cites the posting span or news item it came from (the chips); sentences without a valid citation are dropped. {brief!.reviewed ? "Reviewed by hand." : "Not yet reviewed by hand."}</Note>
                </div>
              </>
            ) : (
              <EmptyState title="No written brief yet">
                The sections below show the stored evidence. Generate the brief with <code className="mono text-ink">npm run briefs -- --slug {company.slug}</code>.
                {best && bestQuote?.e && <> Strongest live-agent quote: <Link className="text-ink live-underline" href={`/postings/${bestQuote.p.id}#e0`}>“{bestQuote.e.quote}”</Link>.</>}
              </EmptyState>
            )}
          </Section>

          {/* Timing */}
          <Section id="now" num="02" eyebrow="Why now" title={active.length ? `${active.length} active ${active.length === 1 ? "trigger" : "triggers"}.` : "No active trigger."}>
            <ul className="rounded-[14px] border border-line bg-surface divide-y divide-line">
              {active.length ? active.map((t) => (
                <li key={t.id} className="px-5 py-4 grid grid-cols-1 sm:grid-cols-[8rem_12rem_1fr_5rem] gap-1 sm:gap-4 sm:items-center text-[14px]">
                  <span className="mono text-muted">{shortDate(t.date)}</span>
                  <span className="text-ink font-medium">{TRIGGER_NAMES[t.kind]}</span>
                  <a href={t.url ?? "#"} target={t.url?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-body underline decoration-line-strong underline-offset-4 hover:text-ink">{t.title}</a>
                  <span className="font-mono text-[12px] text-ink sm:text-right">{t.points} pts</span>
                </li>
              )) : <li className="px-5 py-4 text-muted text-[15px]">No funding, launch, acquisition, hiring or model-release trigger in the window (90 days; model releases 30 days).</li>}
            </ul>
          </Section>
        </>
      )}

      {/* Qualifying roles */}
      <Section id="roles" num={isLead ? "03" : "01"} eyebrow="Qualifying roles" title={qualifying.length ? `${qualifying.length} ${qualifying.length === 1 ? "role passes" : "roles pass"} both gates.` : "No role passes both gates."}>
        {qualifying.length > 0 && (
          <>
            <ShareLegend className="mb-4" />
            <div className="rounded-[14px] border border-line bg-surface overflow-hidden divide-y divide-line">
              {qualifying.map((p) => {
                const n = dutyCounts(byPosting.get(p.id) ?? []);
                const c = costs.find((x) => x.postingId === p.id);
                return (
                  <Link key={p.id} href={`/postings/${p.id}`} className="grid grid-cols-1 gap-3 px-5 py-4 transition-colors hover:bg-surface-2 sm:grid-cols-[1.6fr_1fr_8rem_8rem] sm:items-center">
                    <span>
                      <span className="h-card !text-[17px] block">{p.title}</span>
                      <span className="mono !text-[12px] text-muted">{p.agentType ? `${p.agentType} agent · ` : ""}{extractionOf(p)?.seniority ?? ""} · posted {shortDate(p.postedAt)} · live agent {p.liveAgentStrength}/25</span>
                    </span>
                    <span>
                      <ShareBar covered={n.coveredShare} assisted={n.assistedShare} />
                      <span className="mono !text-[12px] text-muted mt-1 block">{pct(p.overlap)} overlap · {n.covered} covered, {n.assisted} assisted of {n.total}</span>
                    </span>
                    <span className="text-[14px] sm:text-right text-ink">{p.salaryMin != null ? money(p.salaryMin, { compact: true }) : <span className="text-muted">No salary</span>}</span>
                    <span className="text-[14px] sm:text-right text-ink">{c?.cost != null ? money(c.cost, { compact: true }) : <span className="text-muted">–</span>}</span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 hidden sm:flex justify-end gap-10 pr-5"><span className="label">Salary min</span><span className="label">Manual work / yr</span></div>
          </>
        )}
        {otherPostings.length > 0 && (
          <div className="mt-6 rounded-[14px] border border-line bg-surface overflow-hidden">
            <Disclosure show={`Show ${otherPostings.length} other ${otherPostings.length === 1 ? "role" : "roles"} checked`} hide={`Hide ${otherPostings.length} other ${otherPostings.length === 1 ? "role" : "roles"} checked`}>
              <ul className="divide-y divide-line border-t border-line">
                {otherPostings.map((p) => (
                  <li key={p.id} className="px-5 py-3 text-[14px] flex flex-wrap gap-3">
                    <Link className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink" href={`/postings/${p.id}`}>{p.title}</Link>
                    <span className="ml-auto text-muted text-[13px] text-right">{p.failReason?.replace(/_/g, " ") ?? "pending extraction"}</span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          </div>
        )}
      </Section>

      {/* Role breakdown */}
      {qualifying.length > 0 && (
        <Section id="duties" num={isLead ? "04" : "02"} eyebrow="Role breakdown" title="What each role asks for, duty by duty.">
          <div className="flex flex-col gap-5">
            {qualifying.map((p) => {
              const ds = byPosting.get(p.id) ?? [];
              const n = dutyCounts(ds);
              const order: Record<string, number> = { covered: 0, assisted: 1, not_covered: 2 };
              const sorted = [...ds].sort((a, b) => (order[a.label] ?? 3) - (order[b.label] ?? 3) || a.idx - b.idx);
              const matched = sorted.filter((d) => d.label !== "not_covered");
              const rest = sorted.filter((d) => d.label === "not_covered");
              const row = (d: DutyRow) => (
                <li key={d.id} className="grid grid-cols-1 gap-1.5 px-5 py-3 sm:grid-cols-[10.5rem_1fr_minmax(0,16rem)] sm:items-start sm:gap-4">
                  <span><LabelChip label={d.label} kind={d.notCoveredKind} /></span>
                  <Link href={`/postings/${p.id}#d${d.idx}`} className="text-[14.5px] text-ink hover:underline underline-offset-4">{d.text}</Link>
                  <span className="text-[13px] text-muted">
                    {d.taskId ? <><span className="font-mono text-covered">{d.taskId}</span> · {coverageMap.tasks.find((t) => t.id === d.taskId)?.does}</> : d.rationale}
                  </span>
                </li>
              );
              return (
                <div key={p.id} className="rounded-[14px] border border-line bg-surface overflow-hidden">
                  <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="h-card !text-[17px]">{p.title}</p>
                      <span className="mono !text-[12px] text-muted">{n.covered} NeoSigma does · {n.assisted} NeoSigma prepares · {n.total - n.covered - n.assisted} not NeoSigma&apos;s work</span>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Link href={`/postings/${p.id}`} className="btn btn-secondary btn-sm">Full role breakdown</Link>
                      <a href={p.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Job posting ↗</a>
                    </div>
                  </div>
                  <ul className="divide-y divide-line">{matched.map(row)}</ul>
                  {!ds.length && <p className="px-5 py-4 text-[14px] text-muted">No duties stored for this posting.</p>}
                  {rest.length > 0 && (
                    <Disclosure className="border-t border-line"
                      show={`Show ${rest.length} ${rest.length === 1 ? "duty" : "duties"} outside NeoSigma's six tasks`}
                      hide={`Hide ${rest.length} ${rest.length === 1 ? "duty" : "duties"} outside NeoSigma's six tasks`}>
                      <ul className="divide-y divide-line border-t border-line">{rest.map(row)}</ul>
                    </Disclosure>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {isLead && (
        <>
          {/* Task split */}
          <Section id="tasks" num="05" eyebrow="Task split" title={`Lead with the ${proof.name.replace(/^The /, "")}.`}>
            <p className="mb-5 max-w-[900px] text-[15px] leading-relaxed text-body">
              NeoSigma does six tasks. For each one, this counts how many duties across {company.name}&apos;s qualifying roles it would handle.
              The tasks with the most point to the proof to open the conversation with: {proof.claim}{" "}
              <a href={proof.url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4 decoration-line-strong">Read the study ↗</a>
            </p>
            <ShareLegend className="mb-4" />
            <div className="rounded-[14px] border border-line bg-surface divide-y divide-line">
              {split.map((x) => {
                const total = x.covered + x.assisted;
                const t = coverageMap.tasks.find((k) => k.id === x.t)!;
                const lead = proof.for_tasks.includes(x.t) && total > 0;
                return (
                  <div key={x.t} className={`grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[18rem_1fr] md:items-center md:gap-6 ${lead ? "bg-surface-2" : ""}`}>
                    <div>
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
                        <span className="font-mono text-covered">{x.t}</span> {t.short}
                        {lead && <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink">Lead proof</span>}
                      </p>
                      <p className="mt-0.5 text-[13px] text-muted">{total ? `${x.covered} done by NeoSigma · ${x.assisted} prepared for a person` : "No matching duties"}</p>
                    </div>
                    <div className="flex h-7 items-stretch gap-[2px]" aria-hidden="true">
                      {x.covered > 0 && <div className="flex min-w-[1.75rem] items-center justify-end rounded-l-[4px] bg-covered px-2 font-mono text-[11px] font-semibold text-[#06231d]" style={{ width: `${(x.covered / maxSplit) * 100}%` }}>{x.covered}</div>}
                      {x.assisted > 0 && <div className={`flex min-w-[1.75rem] items-center justify-end bg-assisted px-2 font-mono text-[11px] font-semibold text-[#2a1606] rounded-r-[4px] ${x.covered ? "" : "rounded-l-[4px]"}`} style={{ width: `${(x.assisted / maxSplit) * 100}%` }}>{x.assisted}</div>}
                      {!total && <div className="w-full rounded-[4px] bg-surface-2 ring-1 ring-line" />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3"><Note>Bars share one scale: the longest bar is the task with the most matching duties ({maxSplit}). T1/T2 point to the verification study, T3/T4/T6 to the self-improvement study, T5 to the Scaffolding Tax.</Note></div>
          </Section>

          {/* Score */}
          <Section id="score" num="06" eyebrow="Score breakdown" title={`Lead score ${Math.round(breakdown!.total)} out of 100.`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {([
                ["NeoSigma can do the work", breakdown!.overlap.points, breakdown!.overlap.max, `The best qualifying role does ${pct(breakdown!.overlap.bestOverlap)} NeoSigma work${breakdown!.overlap.extraRoles ? `, plus ${breakdown!.overlap.bonus.toFixed(1)} points for ${breakdown!.overlap.extraRoles} more qualifying ${breakdown!.overlap.extraRoles === 1 ? "role" : "roles"}` : ""}.`],
                ["Agent already live", breakdown!.live.points, breakdown!.live.max, `${LIVE_STRENGTH_TEXT[breakdown!.live.strength]} (${breakdown!.live.strength} of 25)${bestQuote?.e ? `: “${bestQuote.e.quote}”` : ""}.`],
                ["Looks like a buyer", breakdown!.fit.points, breakdown!.fit.max, `${segmentName(company.segment)} (${Math.round(breakdown!.fit.segmentScore * 100)}% segment fit), ${company.employeeBand === "unknown" ? "size unknown" : `${company.employeeBand} employees`}${breakdown!.fit.capped ? "; capped because agent platforms may build in-house" : ""}.`],
                ["Reason to call now", breakdown!.timing.points, breakdown!.timing.max, breakdown!.timing.topTrigger ? `${TRIGGER_NAMES[breakdown!.timing.topTrigger.kind]} on ${shortDate(breakdown!.timing.topTrigger.date)}, the strongest of ${active.length} active ${active.length === 1 ? "trigger" : "triggers"}.` : "No active trigger in the last 90 days."],
              ] as const).map(([name, pts, max, text]) => (
                <div key={name} className="rounded-[14px] border border-line bg-surface p-5">
                  <div className="flex items-baseline justify-between gap-2"><span className="font-medium text-ink">{name}</span><span className="font-mono text-[12px] text-ink">{pts.toFixed(1)} of {max} pts</span></div>
                  <div className="mt-2 h-1.5 rounded-full bg-surface-2 ring-1 ring-line"><div className="h-full rounded-full bg-covered" style={{ width: `${Math.min(1, max ? pts / max : 0) * 100}%` }} /></div>
                  <p className="mt-3 text-[14px] leading-relaxed text-body">{text}</p>
                </div>
              ))}
            </div>
            <div className="mt-4"><Note>Default weights: 40 overlap, 25 live agent, 15 fit, 20 timing. <Link href="/method#weights" className="underline underline-offset-4">How scores are calculated</Link>.</Note></div>
          </Section>

          {/* Cost */}
          <Section id="cost" num="07" eyebrow="The money" title={costCount ? `About ${money(totalCost)} a year of manual work across ${costCount} ${costCount === 1 ? "role" : "roles"}.` : "No salary posted, so no figure."}>
            <div className="rounded-[14px] border border-line bg-surface overflow-x-auto">
              <table className="w-full text-[14px] md:min-w-[640px]">
                <thead className="border-b border-line">
                  <tr>{["Role", "Salary midpoint", "Load", "Overlap", "Cost a year"].map((h, i) => <th key={h} className={`px-4 py-3 font-normal ${i ? "text-right" : "text-left"} ${i === 2 ? "hidden sm:table-cell" : ""}`}><span className="label">{h}</span></th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {costs.map((c) => (
                    <tr key={c.postingId}>
                      <td className="px-4 py-3"><Link href={`/postings/${c.postingId}`} className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">{c.title}</Link></td>
                      <td className="px-4 py-3 text-right">{c.midpoint.value != null ? <>{money(c.midpoint.value)}{c.midpoint.estimated && <span className="font-mono text-[10px] text-assisted ml-1" title={c.midpoint.basis}>EST</span>}</> : <span className="text-muted" title={c.midpoint.basis}>None</span>}</td>
                      <td className="hidden sm:table-cell px-4 py-3 text-right text-body">× {DEFAULT_WEIGHTS.cost.load_factor}</td>
                      <td className="px-4 py-3 text-right text-body">× {pct(c.overlap)}</td>
                      <td className="px-4 py-3 text-right text-ink">{c.cost != null ? money(c.cost) : <span className="text-muted">No salary posted</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><Note>The cost of the work done by hand, not a NeoSigma price or a guaranteed saving. Non-USD salaries are converted at the ECB reference rate; EST marks a same-title median.</Note></div>
          </Section>

          {/* Tools */}
          <Section num="08" eyebrow="Tools named" title={tools.length ? "What the team already uses." : "No tools named in the postings."}>
            {tools.length > 0 && <ul className="flex flex-wrap gap-2">{tools.map((t) => <li key={t} className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[14px] text-ink">{t}</li>)}</ul>}
            <div className="mt-3"><Note>Shown for context, not scored.</Note></div>
          </Section>

          {/* Gaps */}
          <Section num="09" eyebrow="The gaps" title={themes.length ? "Work in these roles that NeoSigma doesn't cover yet." : "No gap themes in these roles."}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {themes.map((t) => {
                const count = qualDuties.filter((d) => d.gapThemeId === t.id).length;
                return (
                  <Link key={t.id} href={`/gaps#g${t.id}`} className="block rounded-[12px] border border-line bg-surface p-4 hover:bg-surface-2 transition-colors">
                    <div className="flex items-center justify-between gap-2"><LabelChip label="not_covered" kind={t.kind} /><span className="label">{count} {count === 1 ? "duty" : "duties"}</span></div>
                    <p className="mt-2 font-medium text-ink">{t.name}</p>
                  </Link>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
