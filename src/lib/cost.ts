// Cost of the manual work. Pure functions, used on the server and in the
// /cost page's live formula.
//
//   yearly cost = salary midpoint × load factor × overlap

export interface CostPosting {
  id: string;
  companyId: number;
  title: string;
  normalizedTitle: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  overlap: number;
}

export interface Midpoint {
  value: number | null;
  estimated: boolean;
  basis: string; // "posting" | "board" | "median of N same-title postings" | why it is missing
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Rates are units of currency per 1 USD; a salary in a currency with no
// rate is left out rather than guessed.
export type FxRates = Record<string, number>;

function postedMidpoint(p: CostPosting, fx: FxRates): number | null {
  if (p.salaryMin == null && p.salaryMax == null) return null;
  const lo = p.salaryMin ?? p.salaryMax!;
  const hi = p.salaryMax ?? p.salaryMin!;
  const cur = (p.currency ?? "USD").toUpperCase();
  if (cur === "USD") return (lo + hi) / 2;
  const rate = fx[cur];
  return rate ? (lo + hi) / 2 / rate : null;
}

// Postings without a salary use the median of same-title postings in the
// dataset, marked "estimated", and only when at least `minSameTitle` exist.
export function midpoints(postings: CostPosting[], minSameTitle: number, fx: FxRates = {}): Map<string, Midpoint> {
  const byTitle = new Map<string, number[]>();
  for (const p of postings) {
    const m = postedMidpoint(p, fx);
    if (m != null) byTitle.set(p.normalizedTitle, [...(byTitle.get(p.normalizedTitle) ?? []), m]);
  }
  const out = new Map<string, Midpoint>();
  for (const p of postings) {
    const m = postedMidpoint(p, fx);
    if (m != null) {
      const cur = (p.currency ?? "USD").toUpperCase();
      out.set(p.id, { value: m, estimated: false, basis: cur === "USD" ? "posted range" : `posted range in ${cur}, converted to USD` });
      continue;
    }
    const peers = byTitle.get(p.normalizedTitle) ?? [];
    if (peers.length >= minSameTitle) {
      out.set(p.id, { value: median(peers), estimated: true, basis: `median of ${peers.length} same-title postings` });
    } else {
      out.set(p.id, { value: null, estimated: false, basis: `no salary; ${peers.length} same-title postings with salary (need ${minSameTitle})` });
    }
  }
  return out;
}

export function yearlyCost(midpoint: number, loadFactor: number, overlap: number): number {
  return midpoint * loadFactor * overlap;
}

export function roleFamily(title: string): string {
  const t = title.toLowerCase();
  if (/review|analyst|specialist|operations|ops\b|strategist/.test(t)) return "Reviewer / analyst / ops";
  if (/product manager|\bpm\b/.test(t)) return "Product manager";
  if (/forward[\s-]+deployed|deployment|solutions/.test(t)) return "Forward deployed / deployment";
  if (/eval|quality|qa\b|reliability|test/.test(t)) return "Eval / quality engineer";
  if (/engineer|scientist|staff|developer/.test(t)) return "Applied / agent engineer";
  return "Other";
}
