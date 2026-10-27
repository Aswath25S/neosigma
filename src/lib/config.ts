import coverageMap from "../../config/coverage_map.json";
import roles from "../../config/roles.json";
import weights from "../../config/weights.json";
import modelReleaseFeeds from "../../config/model_release_feeds.json";
import manualTriggers from "../../config/manual_triggers.json";

export type CoverageMap = typeof coverageMap;
export type Roles = typeof roles;
export type Weights = typeof weights;
export type TaskId = "T1" | "T2" | "T3" | "T4" | "T5" | "T6";

export const TASK_IDS: TaskId[] = ["T1", "T2", "T3", "T4", "T5", "T6"];

export { coverageMap, roles, weights, modelReleaseFeeds, manualTriggers };

export const SEGMENTS = [
  { id: "agent_native", name: "Agent-native", priority: 1, what: "AI startups whose product is the agent (support, interviews, voice, coding, research agents)" },
  { id: "vertical_ai", name: "Vertical AI", priority: 2, what: "AI companies in law, healthcare, finance, insurance" },
  { id: "agent_platform", name: "Agent platform", priority: 3, what: "Companies that build agents for other businesses (often partner, not buyer)" },
  { id: "enterprise_cx", name: "Enterprise CX", priority: 4, what: "Established businesses running a customer-facing agent" },
  { id: "saas_copilot", name: "SaaS copilot", priority: 5, what: "Software companies with an AI assistant inside an existing product" },
] as const;

export function segmentName(id: string): string {
  return SEGMENTS.find((s) => s.id === id)?.name ?? id;
}

export function taskShort(id: string | null | undefined): string {
  return coverageMap.tasks.find((t) => t.id === id)?.short ?? "";
}

export const MODELS = {
  extract: "claude-sonnet-5-5",
  screen: "claude-haiku-5-5",
  newsCheck: "claude-haiku-5-5",
  themes: "claude-opus-5-5",
  briefs: "claude-opus-5-5",
  sizes: "claude-sonnet-5-5",
} as const;
