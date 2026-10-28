import Link from "next/link";
import { TASK_IDS, taskShort } from "@/lib/config";

export function TierChip({ tier }: { tier: string | null }) {
  const t = (tier ?? "rejected").toLowerCase();
  return <span className={`tier tier-${t}`}>{tier ?? "Rejected"}</span>;
}

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
