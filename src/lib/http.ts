// Polite HTTP: one request per second per host, an honest user agent, and a
// robots.txt check for plain HTML pages. JSON board APIs are public APIs and
// are not governed by robots.txt, so `politeFetch` only checks robots when
// asked to.

const DEFAULT_UA =
  "EvalHiringRadar/0.1 (independent research prototype; public job boards only)";

export function userAgent(): string {
  return process.env.USER_AGENT || DEFAULT_UA;
}

const lastHit = new Map<string, number>();
const hostQueues = new Map<string, Promise<void>>();
const MIN_GAP_MS = 1000;

async function waitForHost(host: string): Promise<void> {
  const prev = hostQueues.get(host) ?? Promise.resolve();
  const next = prev.then(async () => {
    const wait = (lastHit.get(host) ?? 0) + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHit.set(host, Date.now());
  });
  hostQueues.set(host, next.catch(() => {}));
  return next;
}

const robotsCache = new Map<string, string[]>();

async function disallowedPaths(origin: string): Promise<string[]> {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;
  let rules: string[] = [];
  try {
    await waitForHost(new URL(origin).host);
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": userAgent() },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) rules = parseRobots(await res.text());
  } catch {
    // No robots.txt reachable: treat as no rules.
  }
  robotsCache.set(origin, rules);
  return rules;
}

// Collects Disallow lines from the `User-agent: *` groups.
export function parseRobots(text: string): string[] {
  const out: string[] = [];
  let applies = false;
  let sawRule = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (sawRule) {
        applies = false;
        sawRule = false;
      }
      if (value === "*") applies = true;
    } else if (key === "disallow" || key === "allow") {
      sawRule = true;
      if (applies && key === "disallow" && value) out.push(value);
    }
  }
  return out;
}

export async function robotsAllows(url: string): Promise<boolean> {
  const u = new URL(url);
  const rules = await disallowedPaths(u.origin);
  const path = u.pathname + u.search;
  return !rules.some((rule) => {
    const anchored = rule.endsWith("$");
    const body = anchored ? rule.slice(0, -1) : rule;
    const pattern = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp("^" + pattern + (anchored ? "$" : "")).test(path);
  });
}

export interface PoliteFetchOptions {
  checkRobots?: boolean;
  accept?: string;
  timeoutMs?: number;
}

export async function politeFetch(url: string, opts: PoliteFetchOptions = {}): Promise<Response> {
  if (opts.checkRobots && !(await robotsAllows(url))) {
    throw new Error(`robots.txt disallows ${url}`);
  }
  await waitForHost(new URL(url).host);
  return fetch(url, {
    headers: {
      "User-Agent": userAgent(),
      Accept: opts.accept ?? "application/json, text/html;q=0.9, */*;q=0.5",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
  });
}

export async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await politeFetch(url, { accept: "application/json" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}
