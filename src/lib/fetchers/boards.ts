import { fetchJson, politeFetch } from "../http";
import { htmlToText, normalizeWhitespace } from "../text";
import type { RawPosting, SalaryRange, Source } from "./types";

// ---------- Greenhouse ----------
// https://developers.greenhouse.io/job-board.html#list-jobs

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at: string;
  first_published?: string;
  location?: { name: string };
  offices?: { name: string; location?: string }[];
  content?: string;
}

export async function fetchGreenhouse(src: Source): Promise<RawPosting[]> {
  const api = `https://boards-api.greenhouse.io/v1/boards/${src.board_token}/jobs?content=true`;
  const data = await fetchJson<{ jobs: GhJob[] }>(api);
  if (!data) return [];
  const fetchedAt = new Date().toISOString();
  return data.jobs.map((j) => {
    const locations = [j.location?.name, ...(j.offices ?? []).map((o) => o.location || o.name)]
      .filter((x): x is string => !!x);
    return {
      externalId: String(j.id),
      ats: "greenhouse",
      companyName: src.company,
      title: j.title.trim(),
      url: j.absolute_url,
      sourceUrl: api,
      fetchedAt,
      postedAt: j.first_published ?? j.updated_at ?? null,
      locations: [...new Set(locations)],
      remote: /remote/i.test(locations.join(" ")) || null,
      text: htmlToText(j.content ?? ""),
      salaries: [],
    };
  });
}

// ---------- Lever ----------
// https://github.com/lever/postings-api

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt: number;
  categories?: { location?: string; allLocations?: string[]; team?: string; commitment?: string };
  workplaceType?: string;
  country?: string;
  descriptionPlain?: string;
  description?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min: number; max: number; currency: string; interval: string };
  salaryDescriptionPlain?: string;
}

export async function fetchLever(src: Source): Promise<RawPosting[]> {
  const api = `https://api.lever.co/v0/postings/${src.board_token}?mode=json`;
  const data = await fetchJson<LeverJob[] | { ok: false }>(api);
  if (!data || !Array.isArray(data)) return [];
  const fetchedAt = new Date().toISOString();
  return data.map((j) => {
    const parts = [
      htmlToText(j.description ?? j.descriptionPlain ?? ""),
      ...(j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`),
      j.salaryDescriptionPlain ?? "",
      normalizeWhitespace(j.additionalPlain ?? ""),
    ];
    const locations = j.categories?.allLocations?.length
      ? j.categories.allLocations
      : j.categories?.location
        ? [j.categories.location]
        : [];
    const salaries: SalaryRange[] = j.salaryRange
      ? [{
          min: j.salaryRange.min, max: j.salaryRange.max, currency: j.salaryRange.currency,
          interval: j.salaryRange.interval, location: null, source: "board",
        }]
      : [];
    return {
      externalId: j.id,
      ats: "lever",
      companyName: src.company,
      title: j.text.trim(),
      url: j.hostedUrl,
      sourceUrl: api,
      fetchedAt,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      locations: j.country ? locations.map((l) => (l.includes(j.country!) ? l : `${l} (${j.country})`)) : locations,
      remote: j.workplaceType ? j.workplaceType === "remote" : null,
      text: normalizeWhitespace(parts.filter(Boolean).join("\n\n")),
      salaries,
    };
  });
}

// ---------- Ashby ----------
// https://developers.ashbyhq.com/docs/public-job-posting-api

interface AshbyAddress { postalAddress?: { addressCountry?: string; addressRegion?: string; addressLocality?: string } }
interface AshbyComponent {
  compensationType: string; interval: string; currencyCode: string | null;
  minValue: number | null; maxValue: number | null;
}
interface AshbyJob {
  id: string;
  title: string;
  jobUrl: string;
  publishedAt: string;
  isListed: boolean;
  isRemote: boolean;
  workplaceType?: string;
  location: string;
  address?: AshbyAddress;
  secondaryLocations?: { location: string; address?: AshbyAddress }[];
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: {
    compensationTiers?: { title: string | null; components: AshbyComponent[] }[];
    summaryComponents?: AshbyComponent[];
  };
}

function ashbyLocation(name: string, addr?: AshbyAddress): string {
  const c = addr?.postalAddress?.addressCountry;
  return c && !name.includes(c) ? `${name} (${c})` : name;
}

export async function fetchAshby(src: Source): Promise<RawPosting[]> {
  const api = `https://api.ashbyhq.com/posting-api/job-board/${src.board_token}?includeCompensation=true`;
  const data = await fetchJson<{ jobs: AshbyJob[] }>(api);
  if (!data) return [];
  const fetchedAt = new Date().toISOString();
  return data.jobs.filter((j) => j.isListed !== false).map((j) => {
    const salaries: SalaryRange[] = [];
    for (const tier of j.compensation?.compensationTiers ?? []) {
      for (const c of tier.components) {
        if (c.compensationType === "Salary" && (c.minValue || c.maxValue)) {
          salaries.push({
            min: c.minValue, max: c.maxValue, currency: c.currencyCode, interval: c.interval,
            location: tier.title, source: "board",
          });
        }
      }
    }
    return {
      externalId: j.id,
      ats: "ashby",
      companyName: src.company,
      title: j.title.trim(),
      url: j.jobUrl,
      sourceUrl: api,
      fetchedAt,
      postedAt: j.publishedAt ?? null,
      locations: [
        ashbyLocation(j.location, j.address),
        ...(j.secondaryLocations ?? []).map((l) => ashbyLocation(l.location, l.address)),
      ],
      remote: j.isRemote || j.workplaceType === "Remote",
      text: j.descriptionHtml ? htmlToText(j.descriptionHtml) : normalizeWhitespace(j.descriptionPlain ?? ""),
      salaries,
    };
  });
}

// ---------- Company careers page ----------
// Only used when a company has no supported board. `board_token` holds the
// careers page URL. Each linked job page must pass robots.txt.

export async function fetchCareersPage(src: Source): Promise<RawPosting[]> {
  const res = await politeFetch(src.board_token, { checkRobots: true, accept: "text/html" });
  if (!res.ok) return [];
  const html = await res.text();
  const fetchedAt = new Date().toISOString();
  const base = new URL(src.board_token);
  const links = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: new URL(m[1], base).toString(), label: htmlToText(m[2]) }))
    .filter((l) => l.label.length > 4 && l.label.length < 120 && /\/(jobs?|careers?|positions?|openings?)\//i.test(l.href));
  const out: RawPosting[] = [];
  for (const link of links.slice(0, 40)) {
    try {
      const page = await politeFetch(link.href, { checkRobots: true, accept: "text/html" });
      if (!page.ok) continue;
      const body = (await page.text()).replace(/^[\s\S]*?<body[^>]*>/i, "");
      out.push({
        externalId: link.href,
        ats: "careers",
        companyName: src.company,
        title: link.label.split("\n")[0],
        url: link.href,
        sourceUrl: link.href,
        fetchedAt,
        postedAt: null,
        locations: [],
        remote: null,
        text: htmlToText(body),
        salaries: [],
      });
    } catch {
      // Disallowed or unreachable job page: skip it.
    }
  }
  return out;
}

export async function fetchBoard(src: Source): Promise<RawPosting[]> {
  switch (src.ats) {
    case "greenhouse": return fetchGreenhouse(src);
    case "lever": return fetchLever(src);
    case "ashby": return fetchAshby(src);
    case "careers": return fetchCareersPage(src);
    default: return [];
  }
}
