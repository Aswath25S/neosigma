import Link from "next/link";
import type { Metadata } from "next";
import { coverageMap, roles, weights, SEGMENTS, modelReleaseFeeds } from "@/lib/config";
import { getMeta } from "@/lib/meta";
import { getDb, schema } from "@/lib/db/client";
import { FAIL_REASON_TEXT, type FailReason } from "@/lib/analyze";
import { TRIGGER_NAMES } from "@/lib/scoring";
import { pct, shortDate } from "@/lib/format";
import { SectionHeading } from "@/components/ui";
import { readSources } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Method" };

interface EvalMeta {
  at: string; labeller: string; method: string; postings: number; duties: number; agree: number; missed: number;
  accuracy: number; taskAccuracy: number; confusion: Record<string, number>;
}

export default function MethodPage() {
  const db = getDb();
  const evalMeta = getMeta<EvalMeta>("eval");
  const span = getMeta<{ duties: number; found: number; at: string }>("span_check");
  const lastFetch = getMeta<{ at: string; boards: number; failedBoards: string[]; postingsSeen: number; candidates: number; merged: number }>("last_fetch");
  const lastNews = getMeta<{ at: string; companies: number }>("last_news");
  const lastExtract = getMeta<{ at: string }>("last_extract");
  const postings = db.select({ failReason: schema.postings.failReason, passed: schema.postings.passedGates, extractedAt: schema.postings.extractedAt }).from(schema.postings).all();
  const reasonCounts = new Map<string, number>();
  for (const p of postings) if (p.failReason) reasonCounts.set(p.failReason, (reasonCounts.get(p.failReason) ?? 0) + 1);
  const passed = postings.filter((p) => p.passed).length;
  const extracted = postings.filter((p) => p.extractedAt).length;
  const sources = readSources();
  const byAts = sources.reduce<Record<string, number>>((a, s) => ({ ...a, [s.ats]: (a[s.ats] ?? 0) + 1 }), {});

  const toc = [
    ["coverage", "01", "Coverage map"], ["roles", "02", "Which roles count"], ["gates", "03", "Filters and gates"],
    ["weights", "04", "Scoring"], ["accuracy", "05", "Extraction accuracy"], ["audit", "06", "Filter audit"],
    ["sources", "07", "Data sources"], ["limits", "08", "Known limits"],
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <div className="pt-14 pb-12 max-w-[900px]">
        <div className="label mb-4">Method</div>
        <h1 className="display !text-[clamp(36px,6vw,52px)]">How every number is made</h1>
        <p className="mt-5 text-body text-[17px]">
          Claude reads postings and splits them into duties. Everything after that — gates, overlap, lead scores, tiers and
          cost — is computed in code from the stored fields, so it is repeatable and each number traces back to a quote.
        </p>
      </div>

      <div className="grid lg:grid-cols-[200px_minmax(0,1fr)] gap-10 lg:gap-14">
        <nav className="hidden lg:block"><div className="sticky top-24">
          <div className="label mb-4">On this page</div>
          <ol>{toc.map(([id, n, t]) => (
            <li key={id}><a href={`#${id}`} className="flex gap-3 py-1.5 pl-3 border-l border-line text-[14px] text-muted hover:text-ink"><span className="secnum pt-0.5">{n}</span>{t}</a></li>
          ))}</ol>
        </div></nav>

        <div className="min-w-0 flex flex-col gap-20">
          <section>
            <SectionHeading id="coverage" num="01" title="NeoSigma coverage map" sub={<>Six tasks from NeoSigma&apos;s own blog posts, stored in <code className="mono text-ink">config/coverage_map.json</code>. Every duty is matched against these.</>} />
            <div className="overflow-x-auto"><table className="table min-w-[760px]">
              <thead><tr><th>ID</th><th>What NeoSigma does</th><th>Done by hand</th><th>Typical phrasing</th><th>Source</th></tr></thead>
              <tbody>{coverageMap.tasks.map((t) => (
                <tr key={t.id}>
                  <td className="mono text-ink">{t.id}</td>
                  <td className="text-[14px] text-ink">{t.does}</td>
                  <td className="text-[14px]">{t.by_hand}</td>
                  <td className="text-[13px] text-muted">{t.phrasing.map((p) => `“${p}”`).join(", ")}</td>
                  <td className="text-[13px]">{t.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block hover:text-ink underline decoration-line-strong underline-offset-4">{s.title}</a>)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="grid sm:grid-cols-3 gap-4 mt-8">
              {coverageMap.labels.map((l) => (
                <div key={l.id} className="rounded-[14px] border border-line p-4">
                  <div className="flex items-center gap-2 mb-2"><span className={`hl hl-${l.id} inline-block w-5 h-3`} /><span className="text-ink">{l.name}</span></div>
                  <p className="text-[14px]">{l.definition}</p>
                  <p className="text-[13px] text-muted mt-2">e.g. “{l.example}”</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionHeading id="roles" num="02" title="Which roles count" sub={<>A posting is a lead only if its main job is NeoSigma&apos;s work. A title that merely suggests a company uses AI is never a lead on its own. Lists live in <code className="mono text-ink">config/roles.json</code>.</>} />
            <div className="grid md:grid-cols-3 gap-4">
              {(["keep", "conditional", "drop"] as const).map((k) => (
                <div key={k} className="rounded-[14px] border border-line p-4">
                  <div className="label mb-2">{k}</div>
                  <p className="text-[13px] text-muted mb-3">{roles[k].rule}</p>
                  <ul className="text-[14px] flex flex-col gap-1">{roles[k].titles.map((t) => <li key={t}>{t}</li>)}</ul>
                  <p className="mono !text-[11px] text-muted mt-3">{roles[k].patterns.length} patterns</p>
                </div>
              ))}
            </div>
            <p className="text-[14px] mt-4">Lists are checked keep → drop → conditional, so “Founding Evals Engineer” stays while “Founding AI Engineer” is dropped. Drop-list titles are always discarded. <span className="text-ink">Every other posting is judged on its description, not its title:</span> if the title mentions AI, or the description mentions AI and at least {roles.description_screen.min_hits} of {roles.description_screen.phrases.length} duty phrases (eval sets, transcripts, failure analysis, regression, resolution rate…), a Claude screen (claude-haiku-5-5) reads the description and decides keep, conditional or drop.</p>
          </section>

          <section>
            <SectionHeading id="gates" num="03" title="Filters and gates" />
            <ol className="flex flex-col gap-4 text-[15px]">
              <li><span className="text-ink">Scope.</span> {weights.fetch.regions === "global" ? "All regions" : "US or remote-from-the-US postings"}, English only, posted in the last {weights.fetch.max_posting_age_days} days. Duplicates (same company, same normalized title, descriptions ≥ {weights.fetch.dedupe_similarity * 100}% similar) are merged, keeping every location&apos;s salary.</li>
              <li><span className="text-ink">Stage 1, title and description.</span> The lists above; then the keyword pre-screen and the Claude description screen for every posting not selected by its title.</li>
              <li><span className="text-ink">Extraction.</span> One claude-sonnet-5-5 call per posting splits it into single duties, quotes each exact source span, and labels it. Output is validated with zod; every span is checked word for word against the posting.</li>
              <li><span className="text-ink">Stage 2, duty check.</span> Dropped if fewer than {roles.stage2_min_covered_or_assisted} duties are Covered or Assisted. Conditional titles also need {roles.conditional.min_distinct_tasks} of T1–T6.</li>
              <li><span className="text-ink">Gate 1, overlap.</span> At least {Math.round(roles.gate_overlap_min_share * 100)}% of all listed duties are Covered or Assisted. (The spec set 50%; lowered to {Math.round(roles.gate_overlap_min_share * 100)}% and conditional titles to {roles.conditional.min_distinct_tasks} of T1–T6 to widen the lead list. The live-agent gate is unchanged.)</li>
              <li><span className="text-ink">Gate 2, live agent.</span> A verbatim quote showing an agent already used by real customers: {roles.live_agent_evidence.counts.join("; ")}. Not counted: {roles.live_agent_evidence.does_not_count.join("; ")}. Quotes not found verbatim are discarded.</li>
            </ol>
            <div className="rounded-[14px] border border-line bg-surface p-5 mt-6 font-mono text-[14px] text-ink">
              overlap = (covered + 0.5 × assisted) ÷ (all duties − unclear)
            </div>
            <p className="text-[13px] text-muted mt-2">Worked example: 8 duties, 5 covered, 2 assisted, 1 human work → (5 + 1) ÷ 8 = 75%.</p>
          </section>

          <section>
            <SectionHeading id="weights" num="04" title="Scoring" sub={<>Weights live in <code className="mono text-ink">config/weights.json</code> and can be changed with the sliders on the Leads page. Score = sum of parts ÷ sum of weights × 100.</>} />
            <table className="table">
              <thead><tr><th>Part</th><th className="text-right">Weight</th><th>How it is scored</th></tr></thead>
              <tbody>
                <tr><td className="text-ink">Overlap</td><td className="text-right mono">{weights.parts.overlap}</td><td className="text-[14px]">Best posting&apos;s overlap, plus {weights.overlap.points_per_extra_role} points per extra qualifying role (max +{weights.overlap.max_extra_points}).</td></tr>
                <tr><td className="text-ink">Live-agent strength</td><td className="text-right mono">{weights.parts.live_agent}</td><td className="text-[14px]">0 = no evidence (never a lead), {weights.live_agent_points.in_production} = “in production” quote, {weights.live_agent_points.volume_or_named_product} = volume number or named agent product.</td></tr>
                <tr><td className="text-ink">Fit</td><td className="text-right mono">{weights.parts.fit}</td><td className="text-[14px]">{weights.fit.segment_share * 100}% segment priority ({SEGMENTS.map((s) => `${s.name} ${Math.round((weights.fit.segment_scores as Record<string, number>)[s.id] * 100)}%`).join(", ")}), {weights.fit.size_share * 100}% size band. Agent platforms capped at {weights.fit.agent_platform_cap_points} points.</td></tr>
                <tr><td className="text-ink">Timing</td><td className="text-right mono">{weights.parts.timing}</td><td className="text-[14px]">Highest active trigger in the last {weights.timing.window_days} days (model releases: {weights.timing.model_release_window_days} days): {Object.entries(weights.timing.triggers).map(([k, v]) => `${TRIGGER_NAMES[k]} ${v}`).join(", ")}.</td></tr>
              </tbody>
            </table>
            <p className="text-[14px] mt-4">Tiers: {weights.tiers.hot}+ Hot, {weights.tiers.warm}–{weights.tiers.hot - 1} Warm, under {weights.tiers.warm} Watch. A company with zero live-agent evidence is only ever shown on the Rejected tab.</p>
            <p className="text-[14px] mt-2">Cost: salary midpoint × load factor ({weights.cost.load_factor}) × overlap. No salary → median of same-title postings, marked estimated, only with ≥ {weights.cost.min_same_title_postings} such postings.</p>
          </section>

          <section>
            <SectionHeading id="accuracy" num="05" title="Extraction accuracy" sub="Duty labels are checked against hand labels for 20 postings before scaling. Bar: at least 85% of duty labels match, and every highlighted span is found word for word." />
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="rounded-[14px] border border-line bg-surface p-5">
                <div className="label mb-1">Label agreement</div>
                <div className={`font-display text-[44px] leading-none ${evalMeta ? (evalMeta.accuracy >= 0.85 ? "text-covered" : "text-assisted") : "text-muted"}`}>{evalMeta ? pct(evalMeta.accuracy) : "—"}</div>
                <div className="text-[13px] text-muted mt-2">{evalMeta ? `${evalMeta.agree} of ${evalMeta.duties} hand-labelled duties across ${evalMeta.postings} postings; ${evalMeta.missed} not matched to an extracted duty.` : "Not measured yet. Run npm run eval."}</div>
              </div>
              <div className="rounded-[14px] border border-line bg-surface p-5">
                <div className="label mb-1">Task agreement</div>
                <div className="font-display text-[44px] leading-none text-ink">{evalMeta ? pct(evalMeta.taskAccuracy) : "—"}</div>
                <div className="text-[13px] text-muted mt-2">Same T1–T6, where both said Covered or Assisted.</div>
              </div>
              <div className="rounded-[14px] border border-line bg-surface p-5">
                <div className="label mb-1">Spans found verbatim</div>
                <div className="font-display text-[44px] leading-none text-ink">{span ? pct(span.found / Math.max(1, span.duties)) : "—"}</div>
                <div className="text-[13px] text-muted mt-2">{span ? `${span.found} of ${span.duties} duty spans. Spans not found are never highlighted.` : "No extraction yet."}</div>
              </div>
            </div>
            {evalMeta && (
              <p className="text-[13px] text-muted mt-4">Labelled by {evalMeta.labeller}. {evalMeta.method} Measured {shortDate(evalMeta.at)}. Confusion (hand → model): {Object.entries(evalMeta.confusion).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}.</p>
            )}
          </section>

          <section>
            <SectionHeading id="audit" num="06" title="Filter audit" sub="Every posting that failed a filter stays in the database with its reason." />
            <table className="table">
              <thead><tr><th>Outcome</th><th className="text-right">Postings</th></tr></thead>
              <tbody>
                <tr><td className="text-ink">Passed both gates</td><td className="text-right"><Link className="text-ink underline underline-offset-4" href="/leads">{passed}</Link></td></tr>
                {[...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                  <tr key={r}><td className="text-[14px]">{FAIL_REASON_TEXT[r as FailReason] ?? r}</td><td className="text-right"><Link className="text-ink underline underline-offset-4" href={`/leads?tab=rejected&reason=${r}`}>{n}</Link></td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-[13px] text-muted mt-3">{extracted} postings read by Claude. Titles that matched no list and do not mention AI are not stored.</p>
          </section>

          <section>
            <SectionHeading id="sources" num="07" title="Data sources" />
            <ul className="flex flex-col gap-2 text-[15px]">
              <li><span className="text-ink">{sources.length} seed companies</span> in <code className="mono text-ink">config/sources.csv</code>: {Object.entries(byAts).map(([k, v]) => `${v} ${k}`).join(", ")}. Built from a curated list of agent and vertical-AI companies probed on public boards, large companies on Workday and SmartRecruiters, and Hacker News “Who is hiring?” posts from the last six months (a Claude check keeps companies running a customer-facing agent).</li>
              <li><span className="text-ink">Job boards:</span> Greenhouse (<code className="mono text-[13px]">boards-api.greenhouse.io/v1/boards/&#123;token&#125;/jobs?content=true</code>), Lever (<code className="mono text-[13px]">api.lever.co/v0/postings/&#123;site&#125;?mode=json</code>), Ashby (<code className="mono text-[13px]">api.ashbyhq.com/posting-api/job-board/&#123;name&#125;?includeCompensation=true</code>), Workable (<code className="mono text-[13px]">apply.workable.com/api/v1/widget/accounts/&#123;name&#125;?details=true</code>), SmartRecruiters (<code className="mono text-[13px]">api.smartrecruiters.com/v1/companies/&#123;id&#125;/postings</code>), Workday (<code className="mono text-[13px]">&#123;tenant&#125;.wdN.myworkdayjobs.com/wday/cxs/…/jobs</code>), plus manual imports in <code className="mono text-[13px]">data/raw/manual/</code>.</li>
              <li><span className="text-ink">News:</span> Google News RSS per lead company, company blog feeds in <code className="mono text-[13px]">config/company_feeds.json</code>, and lab feeds for model releases ({modelReleaseFeeds.feeds.map((f) => f.lab).join(", ")}). Headlines are confirmed by a claude-haiku-5-5 check.</li>
              <li><span className="text-ink">Company size:</span> a public source found with Claude web search (LinkedIn, Glassdoor and Indeed excluded), linked on each company page.</li>
              <li><span className="text-ink">Fetching rules:</span> one request per second per host, an honest user agent, robots.txt respected on HTML pages, source URL and fetch time stored with every record. No names, emails or profiles of individuals are stored. LinkedIn, Indeed and Glassdoor are never scraped.</li>
              <li><span className="text-ink">Last runs:</span> fetch {shortDate(lastFetch?.at)}{lastFetch ? ` (${lastFetch.postingsSeen} postings, ${lastFetch.candidates} title matches, ${lastFetch.merged} duplicates merged${lastFetch.failedBoards.length ? `, ${lastFetch.failedBoards.length} boards failed` : ""})` : ""}; extraction {shortDate(lastExtract?.at)}; news {shortDate(lastNews?.at)}.</li>
            </ul>
          </section>

          <section>
            <SectionHeading id="limits" num="08" title="Known limits" />
            <ul className="flex flex-col gap-2 text-[15px] list-disc pl-5">
              <li>Only companies on the seed list are seen. Boards other than Ashby, Greenhouse, Lever, Workable, SmartRecruiters and Workday (iCIMS, Taleo and others) are missed unless imported by hand.</li>
              <li>On Workday and SmartRecruiters, descriptions are read only for jobs the board&apos;s own search returns for AI and eval terms (at most {weights.fetch.max_details_per_board} per board), to keep request volume polite.</li>
              <li>A posting is only read by Claude when its title mentions AI or its description passes the keyword pre-screen; eval work described in unusual words can be missed.</li>
              <li>The {weights.fetch.max_posting_age_days}-day cut-off uses the board&apos;s first-published date, so long-open roles drop out even while still open.</li>
              <li>Duty labels come from the posting&apos;s words. Postings that describe the work vaguely score lower than the job may really be.</li>
              <li>The cost is a minimum estimate of manual work, from posted salary ranges only. Many postings have no salary, so totals undercount.</li>
              <li>News triggers come from headlines only; funding amounts and launch details are not read.</li>
              <li>Public complaints about agent quality are a manual flag in v1 (<code className="mono text-[13px]">config/manual_triggers.json</code>).</li>
              <li>Size bands come from a web search and may be out of date; each links its source.</li>
              <li>English-language postings only. Non-USD salaries are converted at the European Central Bank reference rate fetched on each run.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
