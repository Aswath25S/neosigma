import Link from "next/link";
import { getHeadline } from "@/lib/data";
import { segmentName, taskShort, TASK_IDS } from "@/lib/config";
import { money, shortDate } from "@/lib/format";
import { TRIGGER_NAMES } from "@/lib/scoring";
import { GradientThumb, TierChip } from "@/components/ui";
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
  const t = h.newTrigger;

  return (
    <div className="relative overflow-hidden">
      <BackgroundArcs />
      <section className="relative mx-auto max-w-[960px] px-4 sm:px-6 pt-20 sm:pt-28 pb-16">
        {t && (
          <a href={t.url ?? "#"} target={t.url?.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
            className="relative grain inline-flex max-w-full items-center gap-3 rounded-full pl-1.5 pr-4 py-1.5 mb-10 border border-[#3a2a1c] overflow-hidden hover:border-[#5a4026]"
            style={{ background: "linear-gradient(90deg, #2a1a0f, #3b2614 55%, #1d140d)" }}>
            <span className="mono !text-[11px] text-ink border border-[#6b4a2b] rounded-full px-2.5 py-0.5 shrink-0">NEW</span>
            <span className="text-[14px] text-muted shrink-0 hidden sm:inline">Latest trigger:</span>
            <span className="text-[14px] text-ink truncate">{TRIGGER_NAMES[t.kind]} · {t.title}</span>
            <span className="text-ink shrink-0" aria-hidden="true">→</span>
          </a>
        )}
        <h1 className="display max-w-[780px]">Find the teams doing NeoSigma&apos;s work by hand.</h1>
        <p className="mt-6 text-[18px] text-body max-w-[620px]">
          Job postings for people who review agent conversations, build eval sets from failures, and sign off releases. Each one is
          split into duties, matched to NeoSigma&apos;s six tasks, checked for a live agent, and ranked.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/leads" className="btn btn-primary">See leads</Link>
          <Link href="/try" className="btn btn-secondary">Try a posting</Link>
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

      <section className="relative mx-auto max-w-[960px] px-4 sm:px-6 pb-8">
        <div className="flex items-end mb-6">
          <div>
            <div className="secnum mb-2">01</div>
            <h2 className="h-page">Top leads this week</h2>
          </div>
          <Link href="/leads" className="ml-auto mono text-muted hover:text-ink">All leads →</Link>
        </div>
        {h.top.length ? (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {h.top.map((l) => {
              const task = topTask(l.postings.map((p) => p.id));
              const best = [...l.postings].sort((a, b) => b.overlap - a.overlap)[0];
              return (
                <Link key={l.id} href={`/companies/${l.slug}`} className="group rounded-[14px] bg-surface p-3 hover:bg-surface-2 transition-colors">
                  <GradientThumb segment={l.segment} seed={l.id} label={task ? `${task} · ${taskShort(task)}` : undefined} className="aspect-[16/10]" />
                  <div className="px-1 pt-4 pb-1">
                    <div className="flex items-center gap-2">
                      <div className="h-card truncate">{l.name}</div>
                      <span className="ml-auto"><TierChip tier={l.tier} /></span>
                    </div>
                    <div className="text-[14px] text-body mt-1 truncate">{best?.title}</div>
                    <div className="mono !text-[11px] text-muted mt-2">
                      {segmentName(l.segment)} • Score {Math.round(l.leadScore ?? 0)}
                      {l.breakdown?.timing.topTrigger && <> • {shortDate(l.breakdown.timing.topTrigger.date).replace(/, \d{4}$/, "")}</>}
                    </div>
                  </div>
                </Link>
              );
            })}
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
