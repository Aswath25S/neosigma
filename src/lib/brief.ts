import fs from "node:fs";
import path from "node:path";
import { coverageMap, MODELS, TASK_IDS, taskShort, segmentName } from "./config";
import { cached, structuredCall } from "./claude";
import { BriefSchema, type Brief } from "./schemas";
import { activeTriggers, DEFAULT_WEIGHTS, shownTriggers, TRIGGER_NAMES, type Breakdown } from "./scoring";
import type { CompanyView, StoredExtraction } from "./data";
import { sha256 } from "./text";

export interface Ref {
  id: string;
  kind: "posting" | "duty" | "evidence" | "trigger" | "gap";
  label: string;
  href: string;
  external: boolean;
}

export interface RenderedBrief {
  brief: Brief;
  refs: Record<string, Ref>;
  proofKey: keyof typeof coverageMap.proofs;
  taskWeights: Record<string, number>;
  dropped: string[];
}

// Pick the proof by the company's top task: T1/T2 → verification study,
// T3/T4/T6 → self-improvement study, T5 → Scaffolding Tax.
export function pickProof(taskWeights: Record<string, number>): keyof typeof coverageMap.proofs {
  const sum = (ids: string[]) => ids.reduce((s, t) => s + (taskWeights[t] ?? 0), 0);
  const groups = (Object.keys(coverageMap.proofs) as (keyof typeof coverageMap.proofs)[])
    .map((k) => ({ k, w: sum(coverageMap.proofs[k].for_tasks) }))
    .sort((a, b) => b.w - a.w);
  return groups[0].k;
}

export function buildEvidence(view: CompanyView) {
  const refs: Record<string, Ref> = {};
  const lines: string[] = [];
  const { company, qualifying, duties, triggers, themes, salaries } = view;
  const breakdown = view.breakdown as Breakdown | null;

  lines.push(`Company: ${company.name} (${company.domain}), segment: ${segmentName(company.segment)}, size: ${company.employeeBand} employees.`);
  if (breakdown) {
    lines.push(`Lead score ${Math.round(breakdown.total)} of 100. Live-agent strength ${breakdown.live.strength}/25.`);
  }
  lines.push("\nQualifying postings:");
  qualifying.forEach((p, i) => {
    const id = `P${i + 1}`;
    refs[id] = { id, kind: "posting", label: p.title, href: `/postings/${p.id}`, external: false };
    const sal = salaries.find((x) => x.postingId === p.id)?.salary;
    const salary = p.salaryMin ? `salary ${p.currency ?? "USD"} ${p.salaryMin}–${p.salaryMax}` : "no salary in posting";
    lines.push(`${id}: "${p.title}", overlap ${Math.round((p.overlap ?? 0) * 100)}%, posted ${p.postedAt?.slice(0, 10) ?? "date unknown"}, ${salary}${sal?.converted ? ` (about $${Math.round(sal.mid / 1000)}k USD midpoint)` : ""}.`);
  });

  const taskWeights: Record<string, number> = {};
  lines.push("\nDuties (from qualifying postings):");
  for (const p of qualifying) {
    const pid = Object.values(refs).find((r) => r.href === `/postings/${p.id}`)!.id;
    for (const d of duties.filter((x) => x.postingId === p.id)) {
      const id = `D${d.id}`;
      refs[id] = { id, kind: "duty", label: d.sourceSpan, href: `/postings/${p.id}#d${d.idx}`, external: false };
      if (d.label !== "not_covered" && d.taskId) taskWeights[d.taskId] = (taskWeights[d.taskId] ?? 0) + (d.label === "covered" ? 1 : 0.5);
      const tag = d.label === "not_covered" ? `not covered (${d.notCoveredKind})` : `${d.label}, ${d.taskId} ${taskShort(d.taskId)}`;
      lines.push(`${id} [${pid}]: "${d.sourceSpan}" — ${tag}`);
    }
  }

  lines.push("\nLive-agent quotes:");
  let e = 0;
  for (const p of qualifying) {
    const ex = p.extraction as StoredExtraction | null;
    ex?.verified_evidence.forEach((ev, i) => {
      const id = `E${++e}`;
      refs[id] = { id, kind: "evidence", label: ev.quote, href: `/postings/${p.id}#e${i}`, external: false };
      lines.push(`${id}: "${ev.quote}" (${ev.kind.replace("_", " ")}), from "${p.title}"`);
    });
  }

  // Model releases apply to every lead, so only the newest one is worth a line.
  const allActive = activeTriggers(
    triggers.map((t) => ({ id: t.id, kind: t.kind, date: t.date, title: t.title, url: t.url, source: t.source })),
    DEFAULT_WEIGHTS,
    new Date(),
  );
  const active = shownTriggers(allActive);
  const globalIds = new Set(triggers.filter((t) => t.companyId == null).map((t) => t.id));
  lines.push("\nActive timing triggers (last 90 days; model releases last 30 days):");
  if (!active.length) lines.push("None.");
  for (const t of active) {
    const id = `T${t.id}`;
    const ext = !!t.url && /^https?:/.test(t.url);
    refs[id] = { id, kind: "trigger", label: t.title, href: t.url ?? "#", external: ext };
    lines.push(`${id}: ${TRIGGER_NAMES[t.kind] ?? t.kind} on ${t.date.slice(0, 10)}: ${t.title}${globalIds.has(t.id) ? " (applies to all leads)" : ""}`);
  }

  lines.push("\nGap themes seen at this company:");
  if (!themes.length) lines.push("None.");
  for (const g of themes) {
    const id = `G${g.id}`;
    refs[id] = { id, kind: "gap", label: g.name, href: `/gaps#g${g.id}`, external: false };
    lines.push(`${id}: ${g.name}`);
  }

  const tools = [...new Set(qualifying.flatMap((p) => (p.extraction as StoredExtraction | null)?.agent_tools ?? []))];
  const mids = salaries.map((x) => x.salary?.mid).filter((m): m is number => m != null);
  lines.push(`\nAverage salary of qualifying roles: ${mids.length ? `$${Math.round(mids.reduce((a, b) => a + b, 0) / mids.length / 1000)}k across ${mids.length} of ${salaries.length} roles that list a salary` : "no role lists a salary"}.`);
  lines.push(`\nTools named in postings: ${tools.length ? tools.join(", ") : "none"}.`);

  const proofKey = pickProof(taskWeights);
  const proof = coverageMap.proofs[proofKey];
  const ranked = TASK_IDS.filter((t) => taskWeights[t]).sort((a, b) => taskWeights[b] - taskWeights[a]);
  lines.push(`\nTask weight (covered = 1, assisted = 0.5): ${ranked.map((t) => `${t} ${taskWeights[t]}`).join(", ") || "none"}.`);
  lines.push(`Proof study to lead with: ${proof.name}. Claim: ${proof.claim}`);

  return { text: lines.join("\n"), refs, taskWeights, proofKey };
}

const SYSTEM = fs.readFileSync(path.join(process.cwd(), "prompts", "brief.md"), "utf8");

export async function generateBrief(view: CompanyView): Promise<RenderedBrief> {
  const ev = buildEvidence(view);
  const raw = await cached("brief", [MODELS.briefs, sha256(SYSTEM), ev.text], () =>
    structuredCall({ model: MODELS.briefs, system: SYSTEM, user: ev.text, schema: BriefSchema, effort: "medium", maxTokens: 16000 }),
  );
  // Keep only sentences whose citations all resolve; every claim must link.
  const dropped: string[] = [];
  const clean = <T extends { text: string; cites: string[] }>(items: T[]): T[] =>
    items.filter((s) => {
      const ok = s.cites.length > 0 && s.cites.every((c) => ev.refs[c]);
      if (!ok) dropped.push(s.text);
      return ok;
    });
  const brief: Brief = {
    ...raw,
    why_them: clean(raw.why_them),
    why_now: clean(raw.why_now),
    by_hand: clean(raw.by_hand),
    proof: raw.proof.cites.every((c) => ev.refs[c]) ? raw.proof : { text: raw.proof.text, cites: raw.proof.cites.filter((c) => ev.refs[c]) },
    draft_message_duty: ev.refs[raw.draft_message_duty] ? raw.draft_message_duty : "",
  };
  return { brief, refs: ev.refs, proofKey: ev.proofKey, taskWeights: ev.taskWeights, dropped };
}

export function briefMarkdown(companyName: string, r: RenderedBrief): string {
  const link = (ids: string[]) => ids.map((id) => r.refs[id]).filter(Boolean).map((ref) => `[${ref.id}](${ref.href})`).join(" ");
  const sec = (title: string, items: { text: string; cites: string[] }[], empty: string) =>
    `## ${title}\n\n${items.length ? items.map((s) => `- ${s.text} ${link(s.cites)}`).join("\n") : `- ${empty}`}\n`;
  const proof = coverageMap.proofs[r.proofKey];
  return [
    `# ${companyName}`,
    sec("Why them", r.brief.why_them, "No qualifying evidence stored."),
    sec("Why now", r.brief.why_now, "No active triggers in the last 90 days."),
    sec("What they're doing by hand", r.brief.by_hand.map((s) => ({ ...s, text: `${s.task_id} · ${s.text}` })), "No covered duties stored."),
    `## Which proof to lead with\n\n**${proof.name}.** ${r.brief.proof.text} ${link(r.brief.proof.cites)}\n`,
    `## Draft opening message\n\n${r.brief.draft_message}\n`,
    r.brief.missing.length ? `## Missing data\n\n${r.brief.missing.map((m) => `- ${m}`).join("\n")}\n` : "",
  ].join("\n");
}
