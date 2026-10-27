export function money(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (opts.compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}k`;
  }
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function pct(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${Math.round(x * 100)}%`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "date unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "date unknown";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function daysAgo(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((now.getTime() - t) / 86_400_000));
}

export const LABEL_NAMES: Record<string, string> = {
  covered: "Covered",
  assisted: "Assisted",
  not_covered: "Not covered",
};

export const NC_KIND_NAMES: Record<string, string> = {
  human_work: "Human work",
  possible_gap: "Possible gap",
  unclear: "Unclear",
};
