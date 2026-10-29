// Posted salaries. Pure functions, used on the server and on the Salary &
// Roles page. Only salaries written in a posting or on the
// job board are used; nothing is estimated.

export interface SalaryPosting {
  id: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
}

// Rates are units of currency per 1 USD (ECB reference rates).
export type FxRates = Record<string, number>;

export interface Salary {
  bottom: number; // lowest of the posted range, in USD
  mid: number; // middle of the posted range, in USD
  currency: string; // as posted
  converted: boolean; // true when converted from another currency
}

export type SalaryBasis = "midpoint" | "bottom";

export function postedSalary(p: SalaryPosting, fx: FxRates): Salary | null {
  if (p.salaryMin == null && p.salaryMax == null) return null;
  const lo = p.salaryMin ?? p.salaryMax!;
  const hi = p.salaryMax ?? p.salaryMin!;
  const cur = (p.currency ?? "USD").toUpperCase();
  const rate = cur === "USD" ? 1 : fx[cur];
  if (!rate) return null;
  return { bottom: lo / rate, mid: (lo + hi) / 2 / rate, currency: cur, converted: cur !== "USD" };
}

export function salaryUsed(s: Salary, basis: SalaryBasis): number {
  return basis === "bottom" ? s.bottom : s.mid;
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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
