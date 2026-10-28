import Link from "next/link";
import { getHeadline } from "@/lib/data";
import { segmentName, taskShort, TASK_IDS } from "@/lib/config";
import { money, shortDate } from "@/lib/format";
import { TierChip } from "@/components/ui";
import { TRIGGER_NAMES } from "@/lib/scoring";
import { getDb, schema } from "@/lib/db/client";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

function BackgroundArcs() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute -right-48 -top-24 w-[900px] max-w-none h-[760px] text-white opacity-[0.045]" viewBox="0 0 900 760" fill="none">
      <rect x="260" y="40" width="620" height="620" rx="310" stroke="currentColor" strokeWidth="2" />
      <rect x="380" y="140" width="460" height="560" rx="230" stroke="currentColor" strokeWidth="2" />
      <path d="M120 700 C 120 380, 360 160, 700 160" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function topTask(postingIds: string[]): string | null {
  if (!postingIds.length) return null;
  const duties = getDb().select().from(schema.duties).where(inArray(schema.duties.postingId, postingIds)).all();
  const w: Record<string, number> = {};
  for (const d of duties) if (d.taskId && d.label !== "not_covered") w[d.taskId] = (w[d.taskId] ?? 0) + (d.label === "covered" ? 1 : 0.5);
  return TASK_IDS.filter((t) => w[t]).sort((a, b) => w[b] - w[a])[0] ?? null;
}

export default function Home() {
  const h = getHeadline();
  const stats = [
    { n: String(h.companies), label: "Qualifying companies", href: "/leads" },
    { n: String(h.hot), label: "Hot leads", href: "/leads?tab=hot" },
    { n: String(h.roles), label: "Qualifying roles", href: "/leads?sort=overlap" },
    { n: money(h.cost, { compact: true }), label: "Yearly manual-work cost", href: "/cost" },
  ];

  return (
    <div className="relative overflow-hidden">
      <BackgroundArcs />
      <section className="relative mx-auto max-w-[1200px] px-4 sm:px-6 pt-20 sm:pt-28 pb-16">
        <h1 className="display max-w-[1040px]">Find the teams doing NeoSigma&apos;s work by hand.</h1>
        <p className="mt-6 text-[19px] text-body max-w-[900px]">
          Job postings for people who review agent conversations, build eval sets from failures, and sign off releases. Each one is
          split into duties, matched to NeoSigma&apos;s six tasks, checked for a live agent, and ranked.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/leads" className="btn btn-primary">See leads</Link>
        </div>

        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-px bg-line rounded-[14px] overflow-hidden border border-line">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="bg-bg p-5 sm:p-6 hover:bg-surface">
              <div className="font-display text-[36px] sm:text-[44px] leading-none text-ink">{s.n}</div>
              <div className="label mt-3">{s.label}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-[1200px] px-4 sm:px-6 pb-8">
        <div className="flex items-end mb-6">
          <div>
            <div className="secnum mb-2">01</div>
            <h2 className="h-page">Top leads</h2>
          </div>
          <Link href="/leads" className="ml-auto mono text-body hover:text-ink">All {h.companies} leads →</Link>
        </div>
        {h.top.length ? (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="table min-w-[860px]">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Company</th>
                  <th>Segment</th>
                  <th>Tier</th>
                  <th className="text-right">Score</th>
                  <th>Best role</th>
                  <th>Top task</th>
                  <th>Top trigger</th>
                </tr>
              </thead>
              <tbody>
                {h.top.map((l, i) => {
                  const task = topTask(l.postings.map((p) => p.id));
                  const best = [...l.postings].sort((a, b) => b.overlap - a.overlap)[0];
                  const trig = l.breakdown?.timing.topTrigger;
                  return (
                    <tr key={l.id} className="relative">
                      <td className="mono text-muted">{String(i + 1).padStart(2, "0")}</td>
                      <td>
                        {/* The whole row links to the brief; the stretched link sits on the name. */}
                        <Link href={`/companies/${l.slug}`} className="text-ink font-medium after:absolute after:inset-0 hover:underline underline-offset-4">{l.name}</Link>
                      </td>
                      <td className="text-[14px]">{segmentName(l.segment)}</td>
                      <td><TierChip tier={l.tier} /></td>
                      <td className="text-right font-display text-[20px] text-ink">{Math.round(l.leadScore ?? 0)}</td>
                      <td className="text-[14px] max-w-[280px] truncate" title={best?.title}>{best?.title} <span className="text-muted">· {Math.round((best?.overlap ?? 0) * 100)}%</span></td>
                      <td className="text-[14px] whitespace-nowrap">{task ? <><span className="mono text-covered">{task}</span> {taskShort(task)}</> : "—"}</td>
                      <td className="text-[14px] whitespace-nowrap">{trig ? <>{TRIGGER_NAMES[trig.kind]} <span className="text-muted">· {shortDate(trig.date).replace(/, \d{4}$/, "")}</span></> : <span className="text-muted">None</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-[14px] border border-line bg-surface p-8 text-body">
            No leads yet. Run <code className="mono text-ink">npm run all</code> to fetch postings, extract duties and score companies.
          </div>
        )}
      </section>
    </div>
  );
}
