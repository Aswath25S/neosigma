import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCompanyBySlug, extractionOf, type CompanyView } from "@/lib/data";
import { coverageMap, segmentName, taskShort, TASK_IDS } from "@/lib/config";
import { activeTriggers, DEFAULT_WEIGHTS, LIVE_STRENGTH_TEXT, TRIGGER_NAMES } from "@/lib/scoring";
import { pickProof, type RenderedBrief, type Ref } from "@/lib/brief";
import { money, pct, shortDate, LABEL_NAMES } from "@/lib/format";
import { BriefRail, CopyButton } from "@/components/BriefRail";
import { EmptyState, OverlapBar, SectionHeading, TaskLegend, TierChip } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const v = getCompanyBySlug(slug);
  return { title: v?.company.name ?? "Company" };
}

function Cites({ ids, refs }: { ids: string[]; refs: Record<string, Ref> }) {
  return (
    <span className="whitespace-nowrap">
      {ids.map((id) => {
        const r = refs[id];
        if (!r) return null;
        return (
          <a key={id} href={r.href} target={r.external ? "_blank" : undefined} rel="noreferrer" title={r.label}
            className="ml-1.5 align-[2px] mono !text-[10.5px] text-muted border border-line-strong rounded-full px-1.5 py-px hover:text-ink hover:border-muted">
            {id}
          </a>
        );
      })}
    </span>
  );
}

function Sentences({ items, refs }: { items: { text: string; cites: string[] }[]; refs: Record<string, Ref> }) {
  return (
    <div className="flex flex-col gap-3 text-[16.5px] leading-[1.65] text-body">
      {items.map((s, i) => <p key={i}>{s.text}<Cites ids={s.cites} refs={refs} /></p>)}
    </div>
  );
}

function taskWeights(v: CompanyView): Record<string, number> {
  const w: Record<string, number> = {};
  const ids = new Set(v.qualifying.map((p) => p.id));
  for (const d of v.duties) {
    if (!ids.has(d.postingId) || d.label === "not_covered" || !d.taskId) continue;
    w[d.taskId] = (w[d.taskId] ?? 0) + (d.label === "covered" ? 1 : 0.5);
  }
  return w;
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = getCompanyBySlug(slug);
  if (!v) notFound();
  const { company, qualifying, duties, breakdown, brief, themes, costs } = v;
  const rendered = brief?.content as unknown as RenderedBrief | undefined;
  const refs = rendered?.refs ?? {};
  const tw = taskWeights(v);
  const proofKey = rendered?.proofKey ?? pickProof(tw);
  const proof = coverageMap.proofs[proofKey];
  const active = activeTriggers(v.triggers.map((t) => ({ id: t.id, kind: t.kind, date: t.date, title: t.title, url: t.url, source: t.source })), DEFAULT_WEIGHTS, new Date());
  const qualIds = new Set(qualifying.map((p) => p.id));
  const byTask = TASK_IDS.map((t) => ({
    t,
    duties: duties.filter((d) => qualIds.has(d.postingId) && d.taskId === t && d.label !== "not_covered"),
  })).filter((x) => x.duties.length);
  const tools = [...new Set(qualifying.flatMap((p) => extractionOf(p)?.agent_tools ?? []))];
  const totalCost = costs.reduce((s, c) => s + (c.cost ?? 0), 0);
  const costCount = costs.filter((c) => c.cost != null).length;
  const bestQuote = qualifying.map((p) => ({ p, e: extractionOf(p)?.verified_evidence?.[0] })).find((x) => x.e);
  const isLead = company.status === "lead";
  const otherPostings = v.postings.filter((p) => !p.passedGates);

  const sections = [
    { id: "why-them", num: "01", title: "Why them" },
    { id: "why-now", num: "02", title: "Why now" },
    { id: "by-hand", num: "03", title: "What they're doing by hand" },
    { id: "proof", num: "04", title: "Which proof to lead with" },
    { id: "message", num: "05", title: "Draft opening message" },
    { id: "roles", num: "06", title: "Qualifying roles" },
    { id: "score", num: "07", title: "Lead score" },
    { id: "tools", num: "08", title: "Tools they use" },
    { id: "cost", num: "09", title: "Manual-work cost" },
    { id: "gaps", num: "10", title: "Gaps seen here" },
  ];
  const words = (brief?.markdown ?? "").split(/\s+/).length + duties.length * 12;
  const readTime = Math.max(2, Math.round(words / 220));

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <div className="pt-12 pb-12 grid md:grid-cols-[1fr_280px] gap-8 items-end">
        <div>
          <div className="label mb-4 flex gap-2"><Link href="/leads" className="hover:text-ink">Leads</Link><span>/</span><span>Brief</span></div>
          <h1 className="display !text-[clamp(38px,6vw,56px)]">{company.name}</h1>
          <p className="mono text-muted mt-4 flex flex-wrap gap-x-2 items-center">
            <TierChip tier={isLead ? company.tier : null} />
            <span>{segmentName(company.segment)}</span>•
            <span>{company.employeeBand === "unknown" ? "size unknown" : `${company.employeeBand} employees`}</span>
            {company.sizeSourceUrl && <a className="underline underline-offset-4 decoration-line-strong hover:text-ink" href={company.sizeSourceUrl} target="_blank" rel="noreferrer">source ↗</a>}
            •<a className="hover:text-ink" href={`https://${company.domain}`} target="_blank" rel="noreferrer">{company.domain} ↗</a>
          </p>
        </div>
        {isLead && breakdown && (
          <a href="#score" className="block rounded-[14px] border border-line bg-surface p-5 hover:border-line-strong">
            <div className="label mb-1">Lead score</div>
            <div className="font-display text-[48px] leading-none text-ink">{Math.round(breakdown.total)}</div>
            <div className="mono !text-[11px] text-muted mt-2">Overlap {pct(breakdown.overlap.bestOverlap)} · Live {breakdown.live.strength}/25</div>
          </a>
        )}
      </div>

      {!isLead && (
        <div className="mb-10">
          <EmptyState title="Not a lead">
            {company.name} has no open role that passed both gates. {otherPostings.length ? "See the rejected roles below with the reason for each." : "No AI quality roles were found on its board."}
          </EmptyState>
        </div>
      )}

      <div className="grid lg:grid-cols-[220px_minmax(0,680px)] gap-10 lg:gap-16">
        <aside className="order-first"><BriefRail items={sections} csvHref={`/api/export/company/${company.slug}`} readTime={readTime} /></aside>

        <article className="min-w-0 flex flex-col gap-16">
          {!brief && isLead && (
            <div className="rounded-[12px] border border-line bg-surface p-4 text-[14px] text-body">
              <span className="text-ink">No written brief yet.</span> The sections below show the stored evidence. Generate the brief with{" "}
              <code className="mono text-ink">npm run briefs -- --slug {company.slug}</code>.
            </div>
          )}
          {brief && (
            <p className="mono !text-[11px] text-muted -mb-10">
              Brief generated {shortDate(brief.generatedAt)} by {brief.model} from stored data only. {brief.reviewed ? "Reviewed by hand." : "Not yet reviewed by hand."}
            </p>
          )}

          <section>
            <SectionHeading id="why-them" num="01" title="Why them" />
            {rendered?.brief.why_them.length ? <Sentences items={rendered.brief.why_them} refs={refs} /> : (
              <p className="text-body text-[16.5px]">
                {qualifying.length ? <>
                  {qualifying.length} qualifying role{qualifying.length > 1 ? "s" : ""}, best overlap{" "}
                  <Link className="text-ink underline underline-offset-4" href={`/postings/${qualifying[0].id}`}>{pct(qualifying[0].overlap)}</Link>.
                  {bestQuote && <> Strongest live-agent quote: <Link className="text-ink live-underline" href={`/postings/${bestQuote.p.id}#e0`}>“{bestQuote.e!.quote}”</Link>.</>}
                </> : "No qualifying roles."}
              </p>
            )}
          </section>

          <section>
            <SectionHeading id="why-now" num="02" title="Why now" />
            {rendered?.brief.why_now.length ? <Sentences items={rendered.brief.why_now} refs={refs} /> : null}
            <ul className="mt-4 flex flex-col">
              {active.length ? active.map((t) => (
                <li key={t.id} className="py-3 border-b border-line flex gap-4 text-[14px]">
                  <span className="mono !text-[11px] text-muted w-24 shrink-0 pt-0.5">{shortDate(t.date)}</span>
                  <span className="flex-1">
                    <span className="text-ink">{TRIGGER_NAMES[t.kind]}</span> · {t.points} pts ·{" "}
                    <a href={t.url ?? "#"} target={t.url?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="underline decoration-line-strong underline-offset-4 hover:text-ink">{t.title}</a>
                  </span>
                </li>
              )) : <li className="text-muted text-[15px]">No funding, launch, acquisition or model-release trigger in the window (90 days; model releases 30 days).</li>}
            </ul>
          </section>

          <section>
            <SectionHeading id="by-hand" num="03" title="What they're doing by hand" />
            {rendered?.brief.by_hand.length ? (
              <div className="flex flex-col gap-3 text-[16.5px] text-body mb-6">
                {rendered.brief.by_hand.map((s, i) => (
                  <p key={i}><span className="mono !text-[12px] text-covered mr-2">{s.task_id}</span>{s.text}<Cites ids={s.cites} refs={refs} /></p>
                ))}
              </div>
            ) : null}
            {byTask.length ? (
              <div className="flex flex-col gap-5">
                {byTask.map(({ t, duties: ds }) => (
                  <div key={t}>
                    <div className="label mb-2">{t} · {taskShort(t)}</div>
                    <ul className="flex flex-col gap-1.5">
                      {ds.map((d) => (
                        <li key={d.id} className="text-[14.5px]">
                          <Link href={`/postings/${d.postingId}#d${d.idx}`} className={`hl hl-${d.label}`}>“{d.sourceSpan}”</Link>
                          <span className="mono !text-[11px] text-muted ml-2">{LABEL_NAMES[d.label]}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : <p className="text-muted">No covered or assisted duties stored.</p>}
          </section>

          <section>
            <SectionHeading id="proof" num="04" title="Which proof to lead with" />
            <div className="rounded-[14px] border border-line bg-surface p-5">
              <div className="h-card">{proof.name}</div>
              <p className="text-body text-[15px] mt-2">{proof.claim}</p>
              <p className="text-[13px] text-muted mt-3">
                Picked by top task: {TASK_IDS.filter((t) => tw[t]).sort((a, b) => tw[b] - tw[a]).map((t) => `${t} ${tw[t]}`).join(" · ") || "none"} (covered = 1, assisted = 0.5).{" "}
                <a className="underline underline-offset-4 hover:text-ink" href={proof.url} target="_blank" rel="noreferrer">Read the study ↗</a>
              </p>
            </div>
            {rendered?.brief.proof.text && <p className="text-body text-[16.5px] mt-5">{rendered.brief.proof.text}<Cites ids={rendered.brief.proof.cites} refs={refs} /></p>}
          </section>

          <section>
            <SectionHeading id="message" num="05" title="Draft opening message" />
            {brief ? (
              <div className="rounded-[14px] border border-line bg-surface p-5">
                <p className="text-[16px] text-ink whitespace-pre-wrap leading-[1.7]">{brief.draftMessage}</p>
                <div className="flex flex-wrap items-center gap-3 mt-5">
                  <CopyButton text={brief.draftMessage} label="Copy message" />
                  {rendered?.brief.draft_message_duty && refs[rendered.brief.draft_message_duty] && (
                    <Link href={refs[rendered.brief.draft_message_duty].href} className="mono !text-[11px] text-muted hover:text-ink">
                      References “{refs[rendered.brief.draft_message_duty].label.slice(0, 70)}{refs[rendered.brief.draft_message_duty].label.length > 70 ? "…" : ""}” →
                    </Link>
                  )}
                </div>
                <p className="mono !text-[11px] text-muted mt-4">Draft only. Nothing is sent from this app; a person reviews and sends.</p>
              </div>
            ) : <p className="text-muted">No draft yet: the brief has not been generated.</p>}
            {rendered?.brief.missing.length ? (
              <ul className="mt-4 text-[13px] text-muted list-disc pl-5">{rendered.brief.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            ) : null}
          </section>

          <section>
            <SectionHeading id="roles" num="06" title="Qualifying roles" />
            <div className="mb-4"><TaskLegend /></div>
            {qualifying.length ? (
              <ul className="flex flex-col gap-3">
                {qualifying.map((p) => {
                  const ds = duties.filter((d) => d.postingId === p.id);
                  return (
                    <li key={p.id} className="rounded-[14px] border border-line p-4 hover:bg-surface">
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <Link href={`/postings/${p.id}`} className="h-card !text-[17px] hover:underline underline-offset-4">{p.title}</Link>
                        <span className="mono !text-[11px] text-muted">Posted {shortDate(p.postedAt)}</span>
                        <span className="ml-auto font-display text-[22px] text-ink">{pct(p.overlap)}</span>
                      </div>
                      <OverlapBar duties={ds} className="mt-3" />
                      <div className="mono !text-[11px] text-muted mt-2">
                        {ds.filter((d) => d.label === "covered").length} covered · {ds.filter((d) => d.label === "assisted").length} assisted · {ds.filter((d) => d.label === "not_covered").length} not covered · live agent {p.liveAgentStrength}/25
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-muted">None.</p>}
            {otherPostings.length > 0 && (
              <details className="mt-6">
                <summary className="mono text-muted cursor-pointer hover:text-ink">Other roles checked ({otherPostings.length})</summary>
                <ul className="mt-3 flex flex-col">
                  {otherPostings.map((p) => (
                    <li key={p.id} className="py-2.5 border-b border-line text-[14px] flex gap-3">
                      <Link className="hover:text-ink underline decoration-line-strong underline-offset-4" href={`/postings/${p.id}`}>{p.title}</Link>
                      <span className="ml-auto text-muted text-[13px] text-right">{p.failReason?.replace(/_/g, " ") ?? "pending extraction"}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section>
            <SectionHeading id="score" num="07" title="Lead score" />
            {breakdown && isLead ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { k: "Overlap", p: breakdown.overlap.points, m: breakdown.overlap.max, d: <>Best role at <Link className="text-ink underline underline-offset-4" href={`/postings/${breakdown.overlap.bestPostingId}`}>{pct(breakdown.overlap.bestOverlap)}</Link>{breakdown.overlap.extraRoles ? `, +${breakdown.overlap.bonus.toFixed(1)} for ${breakdown.overlap.extraRoles} extra role(s)` : ""}.</> },
                  { k: "Live-agent strength", p: breakdown.live.points, m: breakdown.live.max, d: <><Link className="text-ink underline underline-offset-4" href={`/postings/${breakdown.live.postingId}#e0`}>{LIVE_STRENGTH_TEXT[breakdown.live.strength]}</Link>.</> },
                  { k: "Fit", p: breakdown.fit.points, m: breakdown.fit.max, d: <>{segmentName(company.segment)}, size {company.employeeBand}{breakdown.fit.capped ? ", capped (agent platform)" : ""}.</> },
                  { k: "Timing", p: breakdown.timing.points, m: breakdown.timing.max, d: breakdown.timing.topTrigger ? <><a className="text-ink underline underline-offset-4" href="#why-now">{TRIGGER_NAMES[breakdown.timing.topTrigger.kind]}</a> on {shortDate(breakdown.timing.topTrigger.date)}.</> : "No active trigger." },
                ].map((x) => (
                  <div key={x.k} className="rounded-[14px] border border-line p-4">
                    <div className="label">{x.k}</div>
                    <div className="font-display text-[26px] text-ink mt-1">{x.p.toFixed(1)}<span className="text-muted text-[15px]"> / {x.m}</span></div>
                    <div className="text-[13.5px] text-body mt-1">{x.d}</div>
                  </div>
                ))}
              </div>
            ) : <p className="text-muted">Not scored: no qualifying role.</p>}
          </section>

          <section>
            <SectionHeading id="tools" num="08" title="Tools they use" />
            {tools.length ? (
              <div className="flex flex-wrap gap-2">{tools.map((t) => <span key={t} className="mono !text-[12px] rounded-full border border-line-strong px-3 py-1 text-ink">{t}</span>)}</div>
            ) : <p className="text-muted">No tools named in the qualifying postings.</p>}
          </section>

          <section>
            <SectionHeading id="cost" num="09" title="Manual-work cost" sub="Salary midpoint × load factor (1.25) × overlap, summed across qualifying roles. This is the cost of the work done by hand, not a NeoSigma price or a guaranteed saving." />
            {costs.length ? (
              <>
                <div className="font-display text-[40px] text-ink">{costCount ? `${money(totalCost)} a year` : "—"}</div>
                <p className="text-[13px] text-muted mb-4">{costCount} of {costs.length} roles have salary data.</p>
                <table className="table">
                  <thead><tr><th>Role</th><th className="text-right">Midpoint</th><th className="text-right">Overlap</th><th className="text-right">Cost / yr</th></tr></thead>
                  <tbody>
                    {costs.map((c) => (
                      <tr key={c.postingId}>
                        <td className="text-[14px]"><Link className="hover:text-ink" href={`/postings/${c.postingId}`}>{c.title}</Link></td>
                        <td className="text-right text-[14px]">{c.midpoint.value != null ? <>{money(c.midpoint.value)}{c.midpoint.estimated && <span className="mono !text-[10px] text-assisted ml-1" title={c.midpoint.basis}>EST</span>}</> : <span className="text-muted" title={c.midpoint.basis}>none</span>}</td>
                        <td className="text-right text-[14px]">{pct(c.overlap)}</td>
                        <td className="text-right text-ink">{money(c.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <p className="text-muted">No qualifying roles.</p>}
          </section>

          <section>
            <SectionHeading id="gaps" num="10" title="Gaps seen here" />
            {themes.length ? (
              <ul className="flex flex-wrap gap-2">
                {themes.map((t) => (
                  <li key={t.id}><Link href={`/gaps#g${t.id}`} className="mono !text-[12px] inline-block rounded-full border border-line-strong px-3 py-1 hover:text-ink">{t.name}</Link></li>
                ))}
              </ul>
            ) : <p className="text-muted">No possible-gap themes in this company&apos;s qualifying roles.</p>}
          </section>
        </article>
      </div>
    </div>
  );
}
