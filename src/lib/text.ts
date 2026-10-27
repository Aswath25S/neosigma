import { createHash } from "node:crypto";

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•", middot: "·",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

// Turns posting HTML into plain text that keeps list items and paragraphs on
// their own lines. This text is what Claude sees and what source spans are
// checked against, so it must be deterministic.
export function htmlToText(html: string): string {
  let s = html;
  // Greenhouse double-encodes its content field.
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section)>/gi, "\n")
    .replace(/<(p|div|h[1-6]|ul|ol|tr|section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return normalizeWhitespace(s);
}

export function normalizeWhitespace(s: string): string {
  return s
    .replace(/ /g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

const SENIORITY = /\b(senior|sr\.?|staff|principal|lead|junior|jr\.?|associate|intern|mid[- ]level|i{1,3}|iv|v)\b/gi;

// Title used for dedupe and same-title salary medians: lowercase, no seniority,
// no location or team suffix after a dash, comma or parenthesis.
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(/\s[-–—|]\s|,/)[0]
    .replace(SENIORITY, " ")
    .replace(/[^a-z0-9\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shingles(s: string, n = 3): Set<string> {
  const words = s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  if (out.size === 0 && words.length) out.add(words.join(" "));
  return out;
}

// Jaccard similarity of word 3-grams; 1.0 means the same text.
export function textSimilarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// Verbatim check used for every source span. Whitespace runs and curly vs.
// straight quotes are treated as equal; every other character must match.
function canonical(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function findSpan(haystack: string, span: string): { start: number; end: number } | null {
  if (!span.trim()) return null;
  const direct = haystack.indexOf(span);
  if (direct >= 0) return { start: direct, end: direct + span.length };
  // Map canonical positions back to the original string.
  const map: number[] = [];
  let canon = "";
  let lastSpace = false;
  for (let i = 0; i < haystack.length; i++) {
    let ch = haystack[i];
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      ch = " ";
      lastSpace = true;
    } else {
      lastSpace = false;
      ch = ch.replace(/[‘’]/, "'").replace(/[“”]/, '"').replace(/[–—]/, "-");
    }
    canon += ch;
    map.push(i);
  }
  const needle = canonical(span);
  const idx = canon.indexOf(needle);
  if (idx < 0) return null;
  return { start: map[idx], end: map[idx + needle.length - 1] + 1 };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}
