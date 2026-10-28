// Lead scoring. Pure functions with no Node or database imports, so the
// browser can re-run them when a weight slider moves. Every number in the
// breakdown names the posting or trigger it came from.

import defaultWeights from "../../config/weights.json";

export type Weights = typeof defaultWeights;
export type Tier = "Hot" | "Warm" | "Watch";
export const DEFAULT_WEIGHTS: Weights = defaultWeights;

export interface ScorePosting {
  id: string;
  title: string;
  overlap: number;
  liveAgentStrength: number;
}

export interface ScoreTrigger {
  id: number;
  kind: string;
  date: string;
  title: string;
  url: string | null;
  source: string;
}

export interface ScoreInput {
  segment: string;
  employeeBand: string;
  postings: ScorePosting[]; // qualifying postings only
  triggers: ScoreTrigger[]; // company triggers plus model releases
}

export interface Breakdown {
  overlap: { points: number; max: number; bestPostingId: string | null; bestOverlap: number; extraRoles: number; bonus: number };
  live: { points: number; max: number; strength: number; postingId: string | null };
  fit: { points: number; max: number; segmentScore: number; sizeScore: number; capped: boolean };
  timing: { points: number; max: number; topTrigger: ScoreTrigger | null; active: (ScoreTrigger & { points: number })[] };
  total: number;
  tier: Tier;
}

export function tierFor(score: number, w: Weights = DEFAULT_WEIGHTS): Tier {
  if (score >= w.tiers.hot) return "Hot";
  if (score >= w.tiers.warm) return "Warm";
  return "Watch";
}

export function activeTriggers(triggers: ScoreTrigger[], w: Weights, now: Date): (ScoreTrigger & { points: number })[] {
  return triggers
    .map((t) => ({ ...t, points: (w.timing.triggers as Record<string, number>)[t.kind] ?? 0 }))
    .filter((t) => {
      const age = (now.getTime() - Date.parse(t.date)) / 86_400_000;
      const window = t.kind === "model_release" ? w.timing.model_release_window_days : w.timing.window_days;
      return age <= window && age >= -1;
    })
    .sort((a, b) => b.points - a.points || b.date.localeCompare(a.date));
}

export function scoreCompany(input: ScoreInput, w: Weights = DEFAULT_WEIGHTS, now = new Date()): Breakdown {
  const parts = w.parts;
  const totalWeight = parts.overlap + parts.live_agent + parts.fit + parts.timing || 1;

  // Overlap: best posting's overlap, plus 5 points (of 40) per extra
  // qualifying role, at most +10. The bonus scales with the slider.
  const best = [...input.postings].sort((a, b) => b.overlap - a.overlap)[0];
  const extraRoles = Math.max(0, input.postings.length - 1);
  const bonusShare = Math.min(w.overlap.max_extra_points, w.overlap.points_per_extra_role * extraRoles) / defaultWeights.parts.overlap;
  const overlapSub = best ? Math.min(1, best.overlap + bonusShare) : 0;

  // Live-agent strength: strongest qualifying posting (0 / 15 / 25 of 25).
  const strongest = [...input.postings].sort((a, b) => b.liveAgentStrength - a.liveAgentStrength)[0];
  const strength = strongest?.liveAgentStrength ?? 0;
  const liveSub = strength / w.live_agent_points.volume_or_named_product;

  // Fit: segment priority and size band; agent platforms capped.
  const segmentScore = (w.fit.segment_scores as Record<string, number>)[input.segment] ?? 0.5;
  const sizeScore = (w.fit.size_scores as Record<string, number>)[input.employeeBand] ?? w.fit.size_scores.unknown;
  let fitPoints = (segmentScore * w.fit.segment_share + sizeScore * w.fit.size_share) * parts.fit;
  const cap = (w.fit.agent_platform_cap_points / defaultWeights.parts.fit) * parts.fit;
  const capped = input.segment === "agent_platform" && fitPoints > cap;
  if (capped) fitPoints = cap;

  // Timing: highest active trigger.
  const active = activeTriggers(input.triggers, w, now);
  const maxTrigger = Math.max(...Object.values(w.timing.triggers));
  const top = active[0] ?? null;
  const timingSub = top ? top.points / maxTrigger : 0;

  const overlapPoints = overlapSub * parts.overlap;
  const livePoints = liveSub * parts.live_agent;
  const timingPoints = timingSub * parts.timing;
  const total = ((overlapPoints + livePoints + fitPoints + timingPoints) / totalWeight) * 100;

  return {
    overlap: { points: overlapPoints, max: parts.overlap, bestPostingId: best?.id ?? null, bestOverlap: best?.overlap ?? 0, extraRoles, bonus: bonusShare * parts.overlap },
    live: { points: livePoints, max: parts.live_agent, strength, postingId: strongest?.id ?? null },
    fit: { points: fitPoints, max: parts.fit, segmentScore, sizeScore, capped },
    timing: { points: timingPoints, max: parts.timing, topTrigger: top, active },
    total,
    tier: tierFor(total, w),
  };
}

export const TRIGGER_NAMES: Record<string, string> = {
  first_eval_hire: "First eval hire",
  funding: "Funding round",
  agent_launch: "Agent launch",
  model_release: "Model release",
  multiple_roles: "Several roles open",
  public_complaints: "Public complaints",
  acquisition: "Acquisition",
};

export const LIVE_STRENGTH_TEXT: Record<number, string> = {
  0: "No evidence",
  15: "In production",
  25: "Volume or named product",
};

// Model releases apply to every lead, so lists show only the newest one.
export function shownTriggers<T extends { kind: string; date: string }>(active: T[]): T[] {
  const newest = active.filter((t) => t.kind === "model_release").sort((a, b) => b.date.localeCompare(a.date))[0];
  return active.filter((t) => t.kind !== "model_release" || t === newest);
}
