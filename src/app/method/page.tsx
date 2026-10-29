import Link from "next/link";
import type { Metadata } from "next";
import { coverageMap, roles, weights } from "@/lib/config";
import { getMeta } from "@/lib/meta";
import { getDb, schema } from "@/lib/db/client";
import { shortDate } from "@/lib/format";
import { Note, Section } from "@/components/ui";
import { readSources } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Method" };

const STEPS: { name: string; summary: string; detail: string }[] = [
  {
    name: "Collect",
    summary: "Read open jobs from public job boards.",
    detail: "Every company on the list publishes its jobs through a public board (Greenhouse, Lever, Ashby, Workable, SmartRecruiters or Workday) that is meant to be read this way. LinkedIn, Indeed and Glassdoor are never touched.",
  },
  {
    name: "Screen",
    summary: "Keep roles whose main job is checking and improving an AI agent.",
    detail: "Clear titles such as AI Quality Analyst are kept and unrelated ones such as Account Executive are dropped. Every other posting is judged on its description: Claude reads it and decides whether the role is really about agent quality.",
  },
  {
    name: "Split into duties",
    summary: "Break each posting into single duties.",
    detail: "Claude lists each separate task the posting describes, one action per duty, and keeps the exact sentence it came from. That sentence is what the role breakdown page highlights, and every one is checked word for word against the posting.",
  },
  {
    name: "Match",
    summary: "Compare every duty with NeoSigma's six tasks.",
    detail: "Each duty is labelled as something NeoSigma does, something it prepares for a person to decide, or not NeoSigma's work. When unsure, the stricter label wins, so doubtful matches never inflate the numbers.",
  },
  {
    name: "Qualify",
    summary: "Keep roles with enough NeoSigma work at companies whose agent is live.",
    detail: "A good part of the role has to be NeoSigma's work, and the posting has to show, in its own words, that the AI agent is already used by real customers. A company that is still building its first agent is not a lead yet.",
  },
  {
    name: "Rank and brief",
    summary: "Score each company and write a short brief.",
    detail: "The score is plain arithmetic, so the same data always gives the same score. Recent news (funding, launches, new model releases) adds a reason to reach out now. Claude then writes a short brief from the stored evidence only, and every sentence links to its source.",
  },
  {
    name: "Find gaps",
    summary: "Group the work NeoSigma doesn't do into themes.",
    detail: "Duties outside the six tasks are grouped into themes such as building custom agents. Themes are ranked by how often they appear at strong leads, since a gap inside a good lead is the one most likely to come up on a sales call.",
  },
];

const LABELS = [
  { id: "covered", name: "NeoSigma does it", text: "The duty is one of the six tasks, done in a repeatable way.", example: "Review a sample of agent conversations each week and log failures." },
  { id: "assisted", name: "NeoSigma prepares, a person decides", text: "NeoSigma does the legwork; a person makes the final call.", example: "Decide which failures to prioritize with the clinical team." },
  { id: "not_covered", name: "Not NeoSigma's work", text: "Managing people, customer calls, roadmaps, or work outside the six tasks.", example: "Present findings to leadership." },
];

function Formula({ title, children, note }: { title: string; children: React.ReactNode; note: React.ReactNode }) {
  return (
    <div className="card card-pad flex flex-col gap-3">
      <p className="h-card !text-[17px]">{title}</p>
      <div className="card-inset font-mono text-[14px] leading-relaxed text-ink">{children}</div>
      <p className="text-[14px] leading-relaxed text-body">{note}</p>
    </div>
  );
}

export default function MethodPage() {
  const db = getDb();
  const lastFetch = getMeta<{ at: string; postingsSeen: number }>("last_fetch");
  const lastNews = getMeta<{ at: string }>("last_news");
  const postings = db.select({ passed: schema.postings.passedGates }).from(schema.postings).all();
  const leadCount = db.select({ status: schema.companies.status }).from(schema.companies).all().filter((c) => c.status === "lead").length;
  const qualifying = postings.filter((p) => p.passed).length;
  const sources = readSources();
  const minShare = Math.round(roles.gate_overlap_min_share * 100);
  const p = weights.parts;

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <div className="pt-10 sm:pt-14 pb-10 max-w-[900px]">
        <div className="label mb-4">Method</div>
        <h1 className="h-page !text-[clamp(32px,5vw,44px)]">How this site finds the teams doing NeoSigma&apos;s work by hand.</h1>
        <p className="mt-4 text-body text-[17px]">
          Companies that run an AI agent for customers often hire people to keep it good: reading conversations, turning failures into
          tests, checking every change before release. Their job postings say so. This site reads those postings, splits each role into
          duties, compares them with what NeoSigma does, and ranks the companies as leads. Claude reads and labels; plain code does all
          the arithmetic, so every number traces back to a line in a posting.
        </p>
        <p className="mono text-muted mt-5">
          {sources.length} companies · {lastFetch ? `${lastFetch.postingsSeen.toLocaleString()} open jobs scanned` : "not fetched yet"} · {qualifying} qualifying roles at {leadCount} companies
          {lastFetch ? ` · jobs fetched ${shortDate(lastFetch.at)}` : ""}{lastNews ? ` · news ${shortDate(lastNews.at)}` : ""}
        </p>
      </div>

      <Section id="how" num="01" eyebrow="How it works" title="Seven steps from job posting to lead.">
        <ol className="card divide-y divide-line">
          {STEPS.map((s, i) => (
            <li key={s.name} className="grid grid-cols-1 gap-2 px-5 py-5 sm:grid-cols-[3rem_14rem_1fr] sm:gap-6">
              <span className="font-mono text-[13px] text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="block font-medium text-ink">{s.name}</span>
                <span className="block text-[14px] text-muted mt-0.5">{s.summary}</span>
              </span>
              <p className="text-[15px] leading-relaxed text-body">{s.detail}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="coverage" num="02" eyebrow="What NeoSigma does" title="Six tasks, taken from NeoSigma's own writing.">
        <p className="mb-6 max-w-[900px] text-[15px] leading-relaxed text-body">
          Our reading of NeoSigma&apos;s blog as of {shortDate(coverageMap.as_of)}, not NeoSigma&apos;s own list. Every duty in every posting is compared with these.
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full text-[14px] md:min-w-[760px]">
            <thead className="border-b border-line">
              <tr>{["What NeoSigma does", "Done by hand today", "Source"].map((h) => <th key={h} className="px-5 py-3 text-left font-normal"><span className="label">{h}</span></th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {coverageMap.tasks.map((t) => (
                <tr key={t.id} className="align-top">
                  <td className="px-5 py-4 text-ink">{t.does}</td>
                  <td className="px-5 py-4 text-body">{t.by_hand}</td>
                  <td className="px-5 py-4 text-[13px]">
                    {t.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block text-body underline decoration-line-strong underline-offset-4 hover:text-ink">{s.title}</a>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-4 mt-4 md:grid-cols-3">
          {LABELS.map((l) => (
            <div key={l.id} className="card card-pad">
              <div className="flex items-center gap-2 mb-2"><span className={`hl hl-${l.id} inline-block w-5 h-3`} /><span className="text-ink">{l.name}</span></div>
              <p className="text-[14px] text-body">{l.text}</p>
              <p className="text-[13px] text-muted mt-2">e.g. “{l.example}”</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="numbers" num="03" eyebrow="The numbers" title="How each number is worked out.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Formula title="Overlap of a role" note="The percentage shown across the site. A prepared duty counts half, because a person still finishes it.">
            (duties NeoSigma does + ½ × duties it prepares) ÷ all duties
          </Formula>
          <Formula title="Which roles qualify" note={<>Here a prepared duty counts in full, so a role can qualify with an overlap below {minShare}%. The live-agent quote must appear word for word in the posting.</>}>
            ≥ {minShare}% of duties NeoSigma does or prepares<br />+ proof the agent is live with customers
          </Formula>
          <Formula title="Lead score, 0 to 100" note={<>Overlap uses the company&apos;s best role, plus a little for each extra qualifying role. Live agent is stronger when the posting names the product or a usage number. Fit is the type and size of company. Timing is the strongest news in the last {weights.timing.window_days} days. The sliders on the Leads page change the weights.</>}>
            {p.overlap} overlap + {p.live_agent} live agent<br />+ {p.fit} fit + {p.timing} timing
          </Formula>
          <Formula title="Salary" note="Posted salaries only; nothing is estimated for roles without one. Non-USD salaries are converted at the European Central Bank rate.">
            middle of the posted range, averaged across roles
          </Formula>
          <Formula title="Ranking gaps" note={<>A strong lead is a company scoring {weights.tiers.warm} or more. A gap that appears in many strong leads is the one most likely to block a deal.</>}>
            strong leads with the gap ÷ all strong leads
          </Formula>
          <Formula title="Which study to lead with" note="Chosen from the tasks a company does by hand: finding and grouping failures point to the verification study; tests, regression checks and setup fixes to the self-improvement study; model testing to the Scaffolding Tax.">
            the study that matches the most duties
          </Formula>
        </div>
        <div className="mt-4"><Note>See any company&apos;s score broken down on its <Link href="/leads" className="underline underline-offset-4">lead page</Link>.</Note></div>
      </Section>

      <Section id="limits" num="04" eyebrow="Known limits" title="What this can't tell you.">
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            "A posting shows intent to hire, not budget or how the team really spends its week.",
            "Duties are not weighted by time spent; a one-line duty counts the same as a big one.",
            "The six tasks are our reading of NeoSigma's public writing and need checking with NeoSigma.",
            "Only companies on the list are seen, and only boards with a public feed. Roles described in unusual words can be missed.",
            "Duty labels come from Claude and have not yet been checked against a hand-labelled sample. Each label shows its reasoning, so it can be checked.",
            "Many postings list no salary, so averages rest on the roles that do. News triggers are read from headlines only.",
          ].map((l) => <li key={l} className="card card-pad text-[15px] leading-relaxed text-body">{l}</li>)}
        </ul>
      </Section>

      <Section id="data" num="05" eyebrow="Data and privacy" title="Public sources only.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="card card-pad text-[14px] leading-relaxed text-body">
            <span className="label">Job postings</span>
            <p className="mt-2">Public job-board feeds for {sources.length} companies, posted in the last {weights.fetch.max_posting_age_days} days, English only. Copies of one role in several locations are merged. One request per second per site, and robots.txt is respected.</p>
          </div>
          <div className="card card-pad text-[14px] leading-relaxed text-body">
            <span className="label">News and company size</span>
            <p className="mt-2">Google News, company blogs and AI lab release feeds, with each headline checked by Claude. Company size comes from a public source, linked on each lead page.</p>
          </div>
          <div className="card card-pad text-[14px] leading-relaxed text-body">
            <span className="label">Privacy</span>
            <p className="mt-2">Everything is kept at company level. No names, emails or profiles of individuals are stored, and nothing is sent from this site; briefs are drafts for a person to review.</p>
          </div>
        </div>
      </Section>
    </div>
  );
}
