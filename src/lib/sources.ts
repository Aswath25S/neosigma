import fs from "node:fs";
import path from "node:path";
import type { Source } from "./fetchers/types";

export const SOURCES_PATH = path.join(process.cwd(), "config", "sources.csv");
const COLUMNS = ["company", "domain", "ats", "board_token", "segment", "employee_band", "size_source_url"] as const;

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function readSources(): Source[] {
  if (!fs.existsSync(SOURCES_PATH)) return [];
  const [header, ...lines] = fs.readFileSync(SOURCES_PATH, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const cols = parseLine(header);
  return lines.map((line) => {
    const cells = parseLine(line);
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""])) as unknown as Source;
  });
}

export function writeSources(rows: Source[]): void {
  const body = rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","));
  fs.writeFileSync(SOURCES_PATH, [COLUMNS.join(","), ...body].join("\n") + "\n");
}
