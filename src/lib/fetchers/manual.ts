import fs from "node:fs";
import path from "node:path";
import { fetchCareersPage } from "./boards";
import type { RawPosting, Source } from "./types";
import { normalizeWhitespace, sha256 } from "../text";

export const MANUAL_DIR = path.join(process.cwd(), "data", "raw", "manual");

// A manual posting is a .txt file with a short header, a line of three dashes,
// then the posting text:
//
//   Company: Acme AI
//   Title: AI Quality Analyst
//   URL: https://acme.ai/careers/ai-quality-analyst
//   Posted: 2026-10-14
//   Location: Remote (US)
//   ---
//   <posting text>
export function readManualPostings(): RawPosting[] {
  if (!fs.existsSync(MANUAL_DIR)) return [];
  const out: RawPosting[] = [];
  for (const file of fs.readdirSync(MANUAL_DIR).filter((f) => f.endsWith(".txt") && f !== "urls.txt")) {
    const raw = fs.readFileSync(path.join(MANUAL_DIR, file), "utf8");
    const [head, ...rest] = raw.split(/^---\s*$/m);
    if (!rest.length) continue;
    const meta = Object.fromEntries(
      head.split(/\r?\n/).map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map((m) => [m![1].toLowerCase(), m![2].trim()]),
    );
    if (!meta.company || !meta.title) continue;
    const stat = fs.statSync(path.join(MANUAL_DIR, file));
    out.push({
      externalId: `manual:${file}`,
      ats: "manual",
      companyName: meta.company,
      title: meta.title,
      url: meta.url || `manual://${file}`,
      sourceUrl: meta.url || `file://data/raw/manual/${file}`,
      fetchedAt: stat.mtime.toISOString(),
      postedAt: meta.posted ? new Date(meta.posted).toISOString() : null,
      locations: meta.location ? [meta.location] : [],
      remote: meta.location ? /remote/i.test(meta.location) : null,
      text: normalizeWhitespace(rest.join("---")),
      salaries: [],
    });
  }
  return out;
}

// data/raw/manual/urls.txt: one "Company | URL" per line. Each URL is fetched
// as a single careers page, subject to robots.txt.
export async function readManualUrls(): Promise<RawPosting[]> {
  const file = path.join(MANUAL_DIR, "urls.txt");
  if (!fs.existsSync(file)) return [];
  const out: RawPosting[] = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const [company, url] = line.split("|").map((s) => s.trim());
    if (!company || !url || line.startsWith("#")) continue;
    const src: Source = { company, domain: new URL(url).host, ats: "careers", board_token: url, segment: "agent_native", employee_band: "unknown", size_source_url: "" };
    const pages = await fetchCareersPage({ ...src, board_token: url });
    out.push(...pages.map((p) => ({ ...p, ats: "manual" as const, externalId: `url:${sha256(p.url).slice(0, 16)}` })));
  }
  return out;
}
