import Link from "next/link";
import { TASK_IDS, taskShort } from "@/lib/config";

export function SectionHeading({ num, title, id, sub }: { num: string; title: string; id?: string; sub?: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 mb-6">
      <div className="secnum mb-2">{num}</div>
      <h2 className="h-page">{title}</h2>
      {sub && <p className="mt-3 text-body max-w-[900px]">{sub}</p>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="pt-14 pb-10">
      <div className="label mb-4">{eyebrow}</div>
      <h1 className="h-page !text-[clamp(32px,5vw,44px)]">{title}</h1>
      {children && <div className="mt-4 text-body max-w-[900px] text-[17px]">{children}</div>}
    </div>
  );
}

export const TASK_COLORS: Record<string, string> = {
  T1: "var(--t1)", T2: "var(--t2)", T3: "var(--t3)", T4: "var(--t4)", T5: "var(--t5)", T6: "var(--t6)",
};

export interface BarDuty {
  label: string;
  taskId: string | null;
}

// 6px overlap bar: covered share segmented by T1–T6 in shades of teal,
// assisted share in amber, the rest empty.
export function OverlapBar({ duties, className = "" }: { duties: BarDuty[]; className?: string }) {
  const counted = duties.length || 1;
  const segs: { key: string; w: number; color: string; title: string }[] = [];
  for (const t of TASK_IDS) {
    const n = duties.filter((d) => d.label === "covered" && d.taskId === t).length;
    if (n) segs.push({ key: `c${t}`, w: n / counted, color: TASK_COLORS[t], title: `${t} ${taskShort(t)}: ${n} covered` });
  }
  const assisted = duties.filter((d) => d.label === "assisted").length;
  if (assisted) segs.push({ key: "a", w: assisted / counted, color: "var(--assisted)", title: `${assisted} assisted` });
  return (
    <div className={`h-1.5 w-full rounded-full bg-surface-2 overflow-hidden flex ${className}`} role="img"
      aria-label={segs.map((s) => s.title).join(", ") || "No covered duties"}>
      {segs.map((s) => (
        <span key={s.key} title={s.title} style={{ width: `${s.w * 100}%`, background: s.color }} className="h-full" />
      ))}
    </div>
  );
}

export function TaskLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {TASK_IDS.map((t) => (
        <span key={t} className="mono !text-[11px] text-muted inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: TASK_COLORS[t] }} />
          {t} {taskShort(t)}
        </span>
      ))}
      <span className="mono !text-[11px] text-muted inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-assisted" /> Assisted
      </span>
    </div>
  );
}

const PALETTES: Record<string, [string, string, string]> = {
  agent_native: ["#3b4bd8", "#8b5cf6", "#1b1f4a"],
  vertical_ai: ["#14b8a6", "#22c55e", "#0b3b33"],
  agent_platform: ["#f59e0b", "#3b82f6", "#3a2a0b"],
  enterprise_cx: ["#f97316", "#dc2626", "#3a120b"],
  saas_copilot: ["#22c55e", "#f97316", "#13300f"],
};

// Grainy gradient thumbnail, one palette per segment.
export function GradientThumb({ segment, label, seed = 0, className = "" }: { segment: string; label?: string; seed?: number; className?: string }) {
  const [a, b, c] = PALETTES[segment] ?? PALETTES.agent_native;
  const x = 20 + ((seed * 37) % 60);
  const y = 15 + ((seed * 53) % 55);
  return (
    <div
      className={`relative grain overflow-hidden rounded-[10px] ${className}`}
      style={{
        background: `radial-gradient(120% 90% at ${x}% ${y}%, ${a} 0%, transparent 60%), radial-gradient(90% 120% at ${100 - x}% ${100 - y}%, ${b} 0%, transparent 55%), ${c}`,
      }}
    >
      {label && (
        <span className="absolute left-3 bottom-3 mono !text-[11px] text-white/90 bg-black/30 rounded-full px-2.5 py-1 backdrop-blur-sm">
          {label}
        </span>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface p-8">
      <div className="h-card mb-2">{title}</div>
      <div className="text-body text-[15px]">{children}</div>
    </div>
  );
}

export function NumLink({ href, children, title }: { href: string; children: React.ReactNode; title?: string }) {
  return (
    <Link href={href} title={title} className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
      {children}
    </Link>
  );
}

// ---- shared pieces for the leads dropdown, case page and role breakdown ----

/** Overlap as one bar: covered share in teal, assisted (counted at half) in amber. */
export function ShareBar({ covered, assisted, className = "" }: { covered: number; assisted: number; className?: string }) {
  return (
    <div className={`flex h-2 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-line ${className}`} aria-hidden="true">
      <div className="bg-covered" style={{ width: `${Math.max(0, covered) * 100}%` }} />
      <div className="bg-assisted" style={{ width: `${Math.max(0, assisted) * 100}%` }} />
    </div>
  );
}

export function ShareLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-body ${className}`}>
      <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-sm bg-covered" />NeoSigma does it (Covered)</span>
      <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-sm bg-assisted" />NeoSigma prepares, a person decides (Assisted, counts half)</span>
      <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-sm bg-surface-2 ring-1 ring-line" />Not NeoSigma&apos;s work</span>
    </div>
  );
}

const CHIP: Record<string, { cls: string; text: string }> = {
  covered: { cls: "border-[color-mix(in_srgb,var(--covered)_45%,transparent)] bg-[color-mix(in_srgb,var(--covered)_14%,transparent)] text-covered", text: "NeoSigma does it" },
  assisted: { cls: "border-[color-mix(in_srgb,var(--assisted)_45%,transparent)] bg-[color-mix(in_srgb,var(--assisted)_14%,transparent)] text-assisted", text: "NeoSigma prepares" },
  human_work: { cls: "border-line-strong text-body", text: "Needs a person" },
  possible_gap: { cls: "border-line-strong border-dashed text-body", text: "Possible gap" },
  unclear: { cls: "border-line-strong text-muted italic", text: "Too vague" },
};

/** Duty label as a chip. Not-covered duties show their kind. */
export function LabelChip({ label, kind }: { label: string; kind?: string | null }) {
  const m = CHIP[label === "not_covered" ? kind ?? "unclear" : label] ?? CHIP.unclear;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] ${m.cls}`}>{m.text}</span>;
}

export function StatBlock({ value, label, href, note }: { value: React.ReactNode; label: string; href?: string; note?: React.ReactNode }) {
  const body = (
    <>
      <div className="font-display text-[34px] sm:text-[44px] leading-none tracking-[-0.02em] text-ink [overflow-wrap:anywhere]">{value}</div>
      <div className="label mt-3">{label}</div>
      {note && <div className="mt-2 text-[13px] text-muted leading-snug">{note}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="block min-w-0 rounded-[14px] border border-line bg-surface p-5 sm:p-6 transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-line-strong">{body}</Link>
  ) : (
    <div className="min-w-0 rounded-[14px] border border-line bg-surface p-5 sm:p-6">{body}</div>
  );
}

/** Page section: mono number + a headline that states a finding. */
export function Section({ id, num, eyebrow, title, children, action }: {
  id?: string; num?: string; eyebrow: string; title: React.ReactNode; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line py-14 sm:py-16">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-[900px]">
          <div className="label mb-3">{num ? `${num} · ` : ""}{eyebrow}</div>
          <h2 className="h-page">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-muted">{children}</p>;
}

/** One stacked bar across all of a role's duties, with a legend that counts them. */
export function DutySplit({ covered, assisted, total }: { covered: number; assisted: number; total: number }) {
  const rest = total - covered - assisted;
  const parts = [
    { key: "covered", count: covered, label: "NeoSigma does it", bar: "bg-covered text-[#06231d]", dot: "bg-covered", hint: "Teal highlight in the posting" },
    { key: "assisted", count: assisted, label: "NeoSigma prepares, a person decides", bar: "bg-assisted text-[#2a1606]", dot: "bg-assisted", hint: "Amber highlight in the posting" },
    { key: "rest", count: rest, label: "not NeoSigma's work", bar: "bg-surface-2 text-body", dot: "bg-surface-2 ring-1 ring-line-strong", hint: "Grey highlight in the posting" },
  ];
  return (
    <div className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="h-card !text-[17px]">What NeoSigma could do in this role</p>
        <span className="label">{total} duties in total</span>
      </div>
      <div className="mt-4 flex h-11 gap-[3px] overflow-hidden rounded-[8px] ring-1 ring-line" role="img"
        aria-label={`${covered} of ${total} duties covered, ${assisted} assisted, ${rest} not NeoSigma's work`}>
        {parts.filter((x) => x.count > 0).map((x) => (
          <div key={x.key} className={`flex min-w-[2.25rem] items-center justify-center font-mono text-[13px] font-semibold ${x.bar}`} style={{ flexGrow: x.count, flexBasis: 0 }}>
            {x.count}
          </div>
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {parts.map((x) => (
          <li key={x.key} className="flex items-start gap-2.5">
            <span className={`mt-1 h-3 w-3 shrink-0 rounded-sm ${x.dot}`} />
            <span className="text-[14px] leading-snug text-body">
              <b className="text-ink">{x.count} of {total}</b> {x.label}
              <span className="block text-[12.5px] text-muted">{x.hint}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
