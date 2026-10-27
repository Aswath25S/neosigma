// npm run seeds
// Builds config/sources.csv from four places, keeping rows already there:
//   1. curated candidate lists (scripts/seed-candidates.ts), probed on
//      Ashby, Greenhouse, Lever and Workable
//   2. large companies on Workday and SmartRecruiters
//   3. Hacker News "Who is hiring?" threads from the last six months: a
//      Claude check keeps companies that run an AI agent for customers and
//      names their segment; linked boards are used, otherwise the name is probed
//   4. boards found by earlier probes (data/seed_probe.json)
// Only company-level facts are kept: name, domain, board, segment. Nothing
// about the people who posted is stored.

import fs from "node:fs";
import { z } from "zod";
import { fetchJson } from "../src/lib/http";
import { cached, hasApiKey, structuredCall } from "../src/lib/claude";
import { MODELS } from "../src/lib/config";
import { readSources, writeSources } from "../src/lib/sources";
import { decodeEntities, sha256, slugify } from "../src/lib/text";
import type { Ats, Segment, Source } from "../src/lib/fetchers/types";
import { CANDIDATES, EXTRA, EXTRA2, ENTERPRISE, type Cand } from "./seed-candidates";

const HN_MONTHS = 6;
const SEGMENTS = ["agent_native", "vertical_ai", "agent_platform", "enterprise_cx", "saas_copilot"] as const;

// ---------- board probes (cheap existence checks) ----------

const PROBES: Record<"ashby" | "greenhouse" | "lever" | "workable", (t: string) => Promise<number>> = {
  ashby: async (t) => (await fetchJson<{ jobs?: unknown[] }>(`https://api.ashbyhq.com/posting-api/job-board/${t}`))?.jobs?.length ?? 0,
  greenhouse: async (t) => (await fetchJson<{ jobs?: unknown[] }>(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs`))?.jobs?.length ?? 0,
  lever: async (t) => {
    const d = await fetchJson<unknown>(`https://api.lever.co/v0/postings/${t}?mode=json&limit=50`);
    return Array.isArray(d) ? d.length : 0;
  },
  workable: async (t) => (await fetchJson<{ jobs?: unknown[] }>(`https://apply.workable.com/api/v1/widget/accounts/${t}`))?.jobs?.length ?? 0,
};

async function safe(fn: () => Promise<number>): Promise<number> {
  try { return await fn(); } catch { return 0; }
}

// Tries each token on every board at once; the board with the most jobs wins.
async function probeTokens(tokens: string[]): Promise<{ ats: Ats; token: string; jobs: number } | null> {
  for (const token of tokens) {
    const results = await Promise.all((Object.keys(PROBES) as (keyof typeof PROBES)[]).map(async (ats) => ({ ats, token, jobs: await safe(() => PROBES[ats](token)) })));
    const best = results.sort((a, b) => b.jobs - a.jobs)[0];
    if (best.jobs > 0) return best;
  }
  return null;
}

async function probeEnterprise(ats: "workday" | "smartrecruiters", token: string): Promise<number> {
  try {
    if (ats === "smartrecruiters") {
      return (await fetchJson<{ totalFound?: number }>(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=1`))?.totalFound ?? 0;
    }
    const [tenant, wd, site] = token.split("/");
    const res = await fetch(`https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": process.env.USER_AGENT ?? "EvalHiringRadar/0.1" },
      body: JSON.stringify({ limit: 1, offset: 0, searchText: "", appliedFacets: {} }),
      signal: AbortSignal.timeout(20000),
    });
    return res.ok ? ((await res.json()) as { total?: number }).total ?? 0 : 0;
  } catch {
    return 0;
  }
}

function nameTokens(name: string): string[] {
  const base = name.replace(/\(.*?\)/g, "").replace(/\b(inc|llc|ltd|corp|co)\.?$/i, "").trim();
  const words = slugify(base).split("-").filter(Boolean);
  const out = [words.join(""), words.join("-")];
  if (words.length > 1 && /^(ai|labs?|hq|health|app|io)$/.test(words.at(-1)!)) out.push(words.slice(0, -1).join(""));
  if (words.length === 1) out.push(`${words[0]}ai`, `${words[0]}hq`);
  return [...new Set(out.filter((t) => t.length > 1))];
}

// ---------- Hacker News ----------

const BOARD_LINK = /(?:jobs\.ashbyhq\.com\/([A-Za-z0-9._-]+))|(?:(?:job-)?boards(?:-api)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([A-Za-z0-9_-]+))|(?:jobs\.lever\.co\/([A-Za-z0-9._-]+))|(?:apply\.workable\.com\/([A-Za-z0-9_-]+))/g;

const HnSchema = z.object({
  items: z.array(z.object({
    index: z.number(),
    company: z.string(),
    domain: z.string().nullable(),
    runs_customer_agent: z.boolean(),
    segment: z.enum(SEGMENTS).nullable(),
  })),
});

const HN_SYSTEM = `You read "Who is hiring?" posts for a sales research tool. For each post, give the hiring company's name as written (no YC batch, no "Inc"), its main website domain if one appears (else null), and decide whether it runs an AI agent or AI assistant that real customers or users already interact with: the product is an agent (support, voice, coding, research, sales, interview, legal, health or finance agents), or the company runs one for its customers, or its product has an AI assistant built in.

Answer false for: AI infrastructure, chips, compute, model labs, data-labeling vendors, eval, observability or LLM-testing tool vendors, and companies that only use AI internally or are only exploring it.

segment (only when true): agent_native = the product is the agent; vertical_ai = AI company in law, healthcare, finance or insurance; agent_platform = builds agents for other businesses; enterprise_cx = established business running a customer-facing agent; saas_copilot = software company with an AI assistant inside an existing product. Reply with JSON only.`;

interface HnFind { company: string; domain: string | null; segment: Segment; boards: { ats: Ats; token: string }[] }

async function hackerNews(): Promise<HnFind[]> {
  const stories = await fetchJson<{ hits: { objectID: string; title: string; created_at: string }[] }>(
    "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=40",
  );
  const threads = (stories?.hits ?? []).filter((h) => /who is hiring/i.test(h.title)).slice(0, HN_MONTHS);
  const posts: { text: string; boards: { ats: Ats; token: string }[] }[] = [];
  for (const t of threads) {
    const item = await fetchJson<{ children: { text: string | null }[] }>(`https://hn.algolia.com/api/v1/items/${t.objectID}`);
    for (const c of item?.children ?? []) {
      const text = decodeEntities((c.text ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      if (!/\b(AI|LLMs?|agents?|agentic|evals?|GenAI)\b/.test(text)) continue;
      const boards: { ats: Ats; token: string }[] = [];
      for (const m of text.matchAll(BOARD_LINK)) {
        const [ash, gh, lev, wk] = m.slice(1);
        if (ash) boards.push({ ats: "ashby", token: ash });
        else if (gh && gh !== "embed") boards.push({ ats: "greenhouse", token: gh });
        else if (lev) boards.push({ ats: "lever", token: lev });
        else if (wk && wk !== "j") boards.push({ ats: "workable", token: wk });
      }
      // Contact details are cut off before Claude sees the post.
      posts.push({ text: text.replace(/\S+@\S+/g, "[email]").slice(0, 700), boards });
    }
  }
  console.log(`HN: ${threads.length} threads, ${posts.length} AI-related posts`);
  const out: HnFind[] = [];
  for (let i = 0; i < posts.length; i += 30) {
    const batch = posts.slice(i, i + 30);
    const user = batch.map((p, j) => `${j}. ${p.text}`).join("\n\n");
    try {
      const r = await cached("hn", [MODELS.newsCheck, sha256(HN_SYSTEM), user], () =>
        structuredCall({ model: MODELS.newsCheck, system: HN_SYSTEM, user, schema: HnSchema, effort: "low", maxTokens: 12000 }),
      );
      for (const it of r.items) {
        const p = batch[it.index];
        if (p && it.runs_customer_agent && it.segment) out.push({ company: it.company.trim(), domain: it.domain, segment: it.segment, boards: p.boards });
      }
    } catch (err) {
      console.warn(`  HN batch ${i / 30} failed: ${(err as Error).message}`);
    }
  }
  // One entry per company; later months add any extra board links.
  const byName = new Map<string, HnFind>();
  for (const f of out) {
    const k = slugify(f.company);
    const prev = byName.get(k);
    if (prev) prev.boards.push(...f.boards);
    else byName.set(k, { ...f, boards: [...f.boards] });
  }
  return [...byName.values()];
}

// ---------- main ----------

async function main() {
  if (!hasApiKey()) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  const rows = new Map<string, Source>();
  const key = (s: { ats: string; board_token: string }) => `${s.ats}:${s.board_token.toLowerCase()}`;
  const names = new Set<string>();
  const add = (s: Source) => {
    if (rows.has(key(s)) || names.has(slugify(s.company))) return false;
    rows.set(key(s), s);
    names.add(slugify(s.company));
    return true;
  };
  for (const s of readSources()) add(s);
  console.log(`existing sources: ${rows.size}`);

  // Boards found by earlier probes but left out for having no AI titles.
  if (fs.existsSync("data/seed_probe.json")) {
    const prev = JSON.parse(fs.readFileSync("data/seed_probe.json", "utf8")) as { found: { company: string; domain: string; segment: Segment; ats: Ats; token: string }[] };
    for (const f of prev.found) add({ company: f.company, domain: f.domain, ats: f.ats, board_token: f.token, segment: f.segment, employee_band: "unknown", size_source_url: "" });
  }
  console.log(`after earlier probes: ${rows.size}`);

  // Curated candidates not yet known.
  const curated: Cand[] = [...CANDIDATES, ...EXTRA, ...EXTRA2].filter((c) => !names.has(slugify(c[0])));
  const queue = [...curated];
  let found = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const [company, domain, segment, tokens] = queue.shift()!;
      const r = await probeTokens(tokens);
      if (r && add({ company, domain, ats: r.ats, board_token: r.token, segment, employee_band: "unknown", size_source_url: "" })) {
        found++;
        console.log(`  + ${company} ${r.ats}/${r.token} (${r.jobs})`);
      }
    }
  }));
  console.log(`curated: ${found} of ${curated.length} new boards found`);

  for (const [company, domain, segment, ats, token] of ENTERPRISE) {
    if (names.has(slugify(company))) continue;
    const n = await probeEnterprise(ats, token);
    if (n > 0 && add({ company, domain, ats, board_token: token, segment, employee_band: "unknown", size_source_url: "" })) console.log(`  + ${company} ${ats} (${n})`);
    else if (!n) console.log(`  ✗ ${company} ${ats}/${token}`);
  }

  const hn = (await hackerNews()).filter((f) => !names.has(slugify(f.company)));
  console.log(`HN: ${hn.length} new agent companies to locate`);
  const hq = [...hn];
  let hnFound = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (hq.length) {
      const f = hq.shift()!;
      let hit: { ats: Ats; token: string } | null = null;
      for (const b of f.boards) {
        if (await safe(() => PROBES[b.ats as keyof typeof PROBES](b.token))) { hit = b; break; }
      }
      if (!hit) hit = await probeTokens(nameTokens(f.company));
      const domain = f.domain?.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") ?? "";
      if (hit && add({ company: f.company, domain, ats: hit.ats, board_token: hit.token, segment: f.segment, employee_band: "unknown", size_source_url: "" })) {
        hnFound++;
        console.log(`  + ${f.company} ${hit.ats}/${hit.token} [${f.segment}]`);
      }
    }
  }));
  console.log(`HN: ${hnFound} boards found`);

  const all = [...rows.values()].sort((a, b) => a.company.localeCompare(b.company));
  writeSources(all);
  const bySeg = all.reduce<Record<string, number>>((a, s) => ({ ...a, [s.segment]: (a[s.segment] ?? 0) + 1 }), {});
  const byAts = all.reduce<Record<string, number>>((a, s) => ({ ...a, [s.ats]: (a[s.ats] ?? 0) + 1 }), {});
  console.log(`\nwrote ${all.length} companies to config/sources.csv`, bySeg, byAts);
}

main();
