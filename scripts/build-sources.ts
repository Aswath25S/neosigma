// Writes config/sources.csv from data/seed_probe.json: the companies with the
// most AI-related titles, capped at 100. Existing employee_band and
// size_source_url values are kept.
//
//   npx tsx scripts/build-sources.ts

import fs from "node:fs";
import { matchTitle } from "../src/lib/filters";
import { readSources, writeSources } from "../src/lib/sources";
import type { Source } from "../src/lib/fetchers/types";

const MAX = 100;
const probe = JSON.parse(fs.readFileSync("data/seed_probe.json", "utf8"));
const existing = new Map(readSources().map((s) => [s.company, s]));

const ranked = (probe.found as { company: string; domain: string; segment: Source["segment"]; ats: Source["ats"]; token: string; matches: { title: string }[] }[])
  .map((f) => {
    const lists = f.matches.map((m) => matchTitle(m.title).list);
    const strong = lists.filter((l) => l === "keep" || l === "conditional").length;
    const ambiguous = lists.filter((l) => l === "ambiguous").length;
    return { f, score: strong * 3 + ambiguous };
  })
  .filter((r) => r.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, MAX);

const rows: Source[] = ranked.map(({ f }) => {
  const prev = existing.get(f.company);
  return {
    company: f.company,
    domain: f.domain,
    ats: f.ats,
    board_token: f.token,
    segment: f.segment,
    employee_band: prev?.employee_band || "unknown",
    size_source_url: prev?.size_source_url || "",
  };
});

writeSources(rows.sort((a, b) => a.company.localeCompare(b.company)));
console.log(`wrote ${rows.length} companies to config/sources.csv`);
