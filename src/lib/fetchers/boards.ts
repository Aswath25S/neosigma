import { fetchJson, politeFetch, userAgent, waitForHost } from "../http";
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


// ---------- Workable ----------
// Public widget API; `details=true` includes the description HTML.

interface WorkableJob {
  title: string; shortcode: string; url: string; published_on?: string; created_at?: string;
  telecommuting?: boolean | string; country?: string; city?: string; state?: string;
  locations?: { country?: string; city?: string; region?: string }[];
  description?: string; requirements?: string; benefits?: string;
}

export async function fetchWorkable(src: Source): Promise<RawPosting[]> {
  const api = `https://apply.workable.com/api/v1/widget/accounts/${src.board_token}?details=true`;
  const data = await fetchJson<{ jobs: WorkableJob[] }>(api);
  if (!data?.jobs) return [];
  const fetchedAt = new Date().toISOString();
  return data.jobs.map((j) => {
    const locs = (j.locations?.length ? j.locations : [{ city: j.city, region: j.state, country: j.country }])
      .map((l) => [l.city, l.region, l.country].filter(Boolean).join(", "))
      .filter(Boolean);
    const remote = j.telecommuting === true || j.telecommuting === "true" || j.telecommuting === "True";
    return {
      externalId: j.shortcode,
      ats: "workable",
      companyName: src.company,
      title: j.title.trim(),
      url: j.url,
      sourceUrl: api,
      fetchedAt,
      postedAt: j.published_on ? new Date(j.published_on).toISOString() : j.created_at ? new Date(j.created_at).toISOString() : null,
      locations: remote ? [...locs, "Remote"] : locs,
      remote,
      text: htmlToText([j.description, j.requirements, j.benefits].filter(Boolean).join("\n")),
      salaries: [],
    };
  });
}

// ---------- SmartRecruiters ----------
// The list endpoint has titles only, so descriptions are fetched one by one
// for postings the board's own search returns for AI and eval terms.

const SEARCH_TERMS = ["AI", "LLM", "agent", "evaluation", "conversational", "machine learning", "quality"];

interface SrPosting {
  id: string; name: string; releasedDate?: string; ref: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
  language?: { code?: string };
}
interface SrDetail extends SrPosting {
  postingUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
}

export async function fetchSmartRecruiters(src: Source, maxDetails = 150): Promise<RawPosting[]> {
  const base = `https://api.smartrecruiters.com/v1/companies/${src.board_token}/postings`;
  const found = new Map<string, SrPosting>();
  for (const q of SEARCH_TERMS) {
    const data = await fetchJson<{ content: SrPosting[] }>(`${base}?q=${encodeURIComponent(q)}&limit=100`);
    for (const p of data?.content ?? []) found.set(p.id, p);
  }
  const fetchedAt = new Date().toISOString();
  const out: RawPosting[] = [];
  for (const p of [...found.values()].filter((p) => !p.language?.code || p.language.code.startsWith("en")).slice(0, maxDetails)) {
    const d = await fetchJson<SrDetail>(`${base}/${p.id}`);
    if (!d) continue;
    const sections = d.jobAd?.sections ?? {};
    const text = ["jobDescription", "qualifications", "additionalInformation", "companyDescription"]
      .map((k) => sections[k]?.text).filter(Boolean).join("\n");
    const l = d.location ?? {};
    out.push({
      externalId: d.id,
      ats: "smartrecruiters",
      companyName: src.company,
      title: d.name.trim(),
      url: d.postingUrl ?? `https://jobs.smartrecruiters.com/${src.board_token}/${d.id}`,
      sourceUrl: `${base}/${d.id}`,
      fetchedAt,
      postedAt: d.releasedDate ?? null,
      locations: [[l.city, l.region, l.country?.toUpperCase()].filter(Boolean).join(", ")].filter(Boolean).concat(l.remote ? ["Remote"] : []),
      remote: l.remote ?? null,
      text: htmlToText(text),
      salaries: [],
    });
  }
  return out;
}

// ---------- Workday ----------
// board_token is "tenant/wdN/site", e.g. "salesforce/wd12/External_Career_Site".
// The board's search narrows thousands of jobs to AI and eval terms; each
// description is then fetched one by one.

interface WdListItem { title: string; externalPath: string; locationsText?: string }
interface WdDetail {
  jobPostingInfo: {
    title: string; jobDescription?: string; location?: string; startDate?: string; externalUrl?: string;
    remoteType?: string; additionalLocations?: string[]; country?: { descriptor?: string };
  };
}

export async function fetchWorkday(src: Source, maxDetails = 150): Promise<RawPosting[]> {
  const [tenant, wd, site] = src.board_token.split("/");
  const host = `https://${tenant}.${wd}.myworkdayjobs.com`;
  const api = `${host}/wday/cxs/${tenant}/${site}`;
  const found = new Map<string, WdListItem>();
  for (const q of SEARCH_TERMS) {
    for (let offset = 0; offset < 100; offset += 20) {
      await waitForHost(new URL(host).host);
      const res = await fetch(`${api}/jobs`, {
        method: "POST",
        headers: { "User-Agent": userAgent(), "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ limit: 20, offset, searchText: q, appliedFacets: {} }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) break;
      const data = (await res.json()) as { jobPostings?: WdListItem[]; total?: number };
      for (const j of data.jobPostings ?? []) found.set(j.externalPath, j);
      if (!data.jobPostings?.length || offset + 20 >= (data.total ?? 0)) break;
    }
  }
  const fetchedAt = new Date().toISOString();
  const out: RawPosting[] = [];
  for (const j of [...found.values()].slice(0, maxDetails)) {
    const d = await fetchJson<WdDetail>(`${api}${j.externalPath}`);
    const info = d?.jobPostingInfo;
    if (!info) continue;
    const locations = [info.location, ...(info.additionalLocations ?? [])].filter((x): x is string => !!x)
      .map((l) => (info.country?.descriptor && !l.includes(info.country.descriptor) ? `${l} (${info.country.descriptor})` : l));
    out.push({
      externalId: j.externalPath,
      ats: "workday",
      companyName: src.company,
      title: info.title.trim(),
      url: info.externalUrl ?? `${host}/${site}${j.externalPath}`,
      sourceUrl: `${api}${j.externalPath}`,
      fetchedAt,
      postedAt: info.startDate ? new Date(info.startDate).toISOString() : null,
      locations,
      remote: info.remoteType ? /remote/i.test(info.remoteType) : null,
      text: htmlToText(info.jobDescription ?? ""),
      salaries: [],
    });
  }
  return out;
}

export async function fetchBoard(src: Source, maxDetails = 150): Promise<RawPosting[]> {
  switch (src.ats) {
    case "greenhouse": return fetchGreenhouse(src);
    case "lever": return fetchLever(src);
    case "ashby": return fetchAshby(src);
    case "workable": return fetchWorkable(src);
    case "smartrecruiters": return fetchSmartRecruiters(src, maxDetails);
    case "workday": return fetchWorkday(src, maxDetails);
    case "careers": return fetchCareersPage(src);
    default: return [];
  }
}
