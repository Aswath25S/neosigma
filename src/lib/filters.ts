import { roles, weights } from "./config";

export type TitleList = "keep" | "conditional" | "drop";
export type TitleMatch =
  | { list: TitleList; pattern: string; via: "pattern" }
  | { list: "ambiguous"; pattern: null; via: "pattern" }
  | { list: "none"; pattern: null; via: "pattern" };

const compiled = {
  keep: roles.keep.patterns.map((p) => new RegExp(p, "i")),
  drop: roles.drop.patterns.map((p) => new RegExp(p, "i")),
  conditional: roles.conditional.patterns.map((p) => new RegExp(p, "i")),
  ai: roles.ai_keywords.map((p) => new RegExp(p, "i")),
};

// Stage 1, code part. Lists are checked keep → drop → conditional so that
// "Founding Evals Engineer" stays a lead while "Founding AI Engineer" is
// dropped. Unmatched titles that mention AI go to the Claude title check.
export function matchTitle(title: string): TitleMatch {
  for (const list of ["keep", "drop", "conditional"] as const) {
    const i = compiled[list].findIndex((re) => re.test(title));
    if (i >= 0) return { list, pattern: roles[list].patterns[i], via: "pattern" };
  }
  if (compiled.ai.some((re) => re.test(title))) return { list: "ambiguous", pattern: null, via: "pattern" };
  return { list: "none", pattern: null, via: "pattern" };
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN",
  "MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA",
  "WA","WV","WI","WY","DC",
];
const US_WORDS = /\b(united states|usa|u\.s\.a?\.?|us|america|americas|north america|new york|san francisco|bay area|seattle|boston|austin|chicago|los angeles|denver|atlanta|miami|washington|palo alto|mountain view|menlo park|sunnyvale|san jose|oakland|brooklyn|nyc|sf|philadelphia|pittsburgh|portland|salt lake|san diego|dallas|houston|nashville|raleigh|minneapolis|detroit|phoenix)\b/i;
const NON_US = /\b(uk|united kingdom|london|england|ireland|dublin|germany|berlin|munich|france|paris|spain|madrid|barcelona|portugal|lisbon|netherlands|amsterdam|poland|warsaw|india|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|singapore|japan|tokyo|korea|seoul|australia|sydney|melbourne|canada|toronto|vancouver|montreal|mexico|brazil|são paulo|sao paulo|argentina|colombia|israel|tel aviv|emea|apac|latam|europe|eu|switzerland|zurich|sweden|stockholm|denmark|copenhagen|norway|finland|italy|milan|czech|prague|romania|ukraine|serbia|philippines|manila|vietnam|china|hong kong|taiwan|uae|dubai|south africa|nigeria|kenya|egypt|new zealand)\b/i;
const STATE_RE = new RegExp(`(,\\s*|\\b)(${US_STATES.join("|")})\\b(?!\\.)`);

// Scope rule: every region when config says "global", otherwise US or
// remote-from-the-US postings only.
export function locationInScope(locations: string[], remote: boolean | null): boolean {
  if (weights.fetch.regions === "global") return true;
  if (!locations.length) return remote !== false;
  return locations.some((raw) => {
    const loc = raw.trim();
    if (US_WORDS.test(loc) || STATE_RE.test(loc)) return true;
    if (/\bremote\b|\banywhere\b/i.test(loc) && !NON_US.test(loc)) return true;
    return false;
  });
}

export function ageInDays(postedAt: string | null, now = new Date()): number | null {
  if (!postedAt) return null;
  const t = Date.parse(postedAt);
  return Number.isNaN(t) ? null : (now.getTime() - t) / 86_400_000;
}

const EN_WORDS = new Set(["the", "and", "to", "of", "a", "in", "you", "with", "for", "our", "we", "will", "on", "is", "are", "your", "as", "or", "be", "this"]);

// English-only rule: share of common English words among the first 400 words.
export function isEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-zà-ÿ]+/g)?.slice(0, 400) ?? [];
  if (words.length < 40) return true;
  const hits = words.filter((w) => EN_WORDS.has(w)).length;
  return hits / words.length >= 0.12;
}

const screen = {
  ai: roles.description_screen.ai_context.map((p) => new RegExp(p, "i")),
  phrases: roles.description_screen.phrases.map((p) => new RegExp(p, "i")),
};

// Free keyword pre-screen on the description: it must mention AI and at
// least `min_hits` distinct duty phrases before Claude reads it.
export function descriptionHits(text: string): string[] {
  if (!screen.ai.some((re) => re.test(text))) return [];
  return roles.description_screen.phrases.filter((_, i) => screen.phrases[i].test(text));
}

export function passesPrescreen(text: string): boolean {
  return descriptionHits(text).length >= roles.description_screen.min_hits;
}
