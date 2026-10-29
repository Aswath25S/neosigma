import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { hasApiKey } from "@/lib/claude";

export const dynamic = "force-dynamic";

const DATA = path.join(process.cwd(), "data");
const LOG = path.join(DATA, "pipeline.log");
const STATUS = path.join(DATA, "pipeline.status.json");
const STEP_NAMES: Record<string, string> = {
  fetch: "Fetching boards", extract: "Reading postings", news: "Checking news", sizes: "Company sizes",
  score: "Scoring", themes: "Grouping gaps", briefs: "Writing briefs",
};

interface Status { running: boolean; pid?: number; startedAt?: string; finishedAt?: string; ok?: boolean; step?: string; error?: string }

function readStatus(): Status {
  try {
    const s = JSON.parse(fs.readFileSync(STATUS, "utf8")) as Status;
    if (s.running && s.pid) {
      try { process.kill(s.pid, 0); } catch { return { ...s, running: false, ok: false, error: "The refresh stopped unexpectedly. See data/pipeline.log." }; }
      const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "";
      const steps = [...log.matchAll(/^> [^\s]+ (\w+)$/gm)].map((m) => m[1]).filter((x) => STEP_NAMES[x]);
      s.step = STEP_NAMES[steps.at(-1) ?? "fetch"];
    }
    return s;
  } catch {
    return { running: false };
  }
}

export async function GET() {
  return Response.json(readStatus());
}

// Runs `npm run all` in the background. One run at a time.
export async function POST() {
  // The pipeline runs locally (npm run all); a deployed copy only serves the results.
  if (process.env.VERCEL) return Response.json({ error: "Refreshing is only available when running locally." }, { status: 403 });
  if (!hasApiKey()) return Response.json({ error: "Set ANTHROPIC_API_KEY in .env.local before refreshing." }, { status: 503 });
  if (readStatus().running) return Response.json({ error: "A refresh is already running." }, { status: 409 });
  fs.mkdirSync(DATA, { recursive: true });
  const out = fs.openSync(LOG, "w");
  const child = spawn("npm", ["run", "all"], { cwd: process.cwd(), detached: true, stdio: ["ignore", out, out], env: process.env });
  const status: Status = { running: true, pid: child.pid, startedAt: new Date().toISOString(), step: STEP_NAMES.fetch };
  fs.writeFileSync(STATUS, JSON.stringify(status));
  child.on("exit", (code) => {
    fs.writeFileSync(STATUS, JSON.stringify({ running: false, startedAt: status.startedAt, finishedAt: new Date().toISOString(), ok: code === 0, ...(code ? { error: `Pipeline exited with code ${code}. See data/pipeline.log.` } : {}) }));
  });
  child.unref();
  return Response.json(status);
}
