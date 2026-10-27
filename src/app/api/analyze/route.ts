import { applyGates, classifyTitle, extractPosting, FAIL_REASON_TEXT, type FailReason, type TitleResult } from "@/lib/analyze";
import { hasApiKey } from "@/lib/claude";
import { matchTitle } from "@/lib/filters";
import { normalizeWhitespace } from "@/lib/text";
import type { ReportData } from "@/components/PostingReport";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CHARS = 20_000;
const PER_IP_PER_HOUR = 10;

// In-memory limits: they reset when the server restarts, which is fine for a
// single-process prototype. Pasted text is never stored or logged.
const ipHits = new Map<string, number[]>();
const daily = { day: "", count: 0 };

function limited(ip: string): string | null {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (daily.day !== today) { daily.day = today; daily.count = 0; }
  const cap = Number(process.env.LIVE_DEMO_DAILY_LIMIT ?? 200);
  if (daily.count >= cap) return "The live demo has reached its daily limit. Try again tomorrow.";
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= PER_IP_PER_HOUR) return "You've run 10 analyses in the last hour. Try again later.";
  hits.push(now);
  ipHits.set(ip, hits);
  daily.count++;
  return null;
}

type Stage = "reading" | "splitting" | "matching" | "live" | "scoring";

export async function POST(req: Request) {
  if (!hasApiKey()) return Response.json({ error: "The server has no Claude API key configured." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { text?: string; company?: string; title?: string } | null;
  const text = normalizeWhitespace(body?.text ?? "");
  if (text.length < 200) return Response.json({ error: "Paste the full posting text (at least 200 characters)." }, { status: 400 });
  if (text.length > MAX_CHARS) return Response.json({ error: `Postings are limited to ${MAX_CHARS.toLocaleString()} characters.` }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const limit = limited(ip);
  if (limit) return Response.json({ error: limit }, { status: 429 });

  const company = (body?.company ?? "").trim().slice(0, 120);
  const givenTitle = (body?.title ?? "").trim().slice(0, 200);
  const guessTitle = givenTitle || text.split("\n").find((l) => l.trim().length > 3 && l.length < 140)?.replace(/\s[—–-]\s.*$/, "").trim() || "";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const stage = (s: Stage, status: "running" | "done") => send({ type: "stage", stage: s, status });
      const order: Stage[] = ["reading", "splitting", "matching", "live", "scoring"];
      let current = 0;
      // Marks every earlier stage done and the target stage running.
      const advance = (s: Stage) => {
        const target = order.indexOf(s);
        while (current < target) {
          stage(order[current], "done");
          current++;
          stage(order[current], "running");
        }
      };
      try {
        stage("reading", "running");
        let title: TitleResult | null = guessTitle ? await classifyTitle(guessTitle, { cache: false }) : null;

        const result = await extractPosting(text, guessTitle, company, {
          cache: false,
          effort: "low",
          onText: (soFar) => {
            if (soFar.includes('"duties"')) advance("splitting");
            if (/"label"\s*:/.test(soFar)) advance("matching");
            if (soFar.includes('"live_agent_evidence"')) advance("live");
          },
        });
        advance("live");
        advance("scoring");

        const extractedTitle = result.extraction.title || guessTitle;
        if (!title && extractedTitle) title = await classifyTitle(extractedTitle, { cache: false });
        const titleList = title?.list ?? (matchTitle(extractedTitle).list === "none" ? "irrelevant" : "keep");
        const g = applyGates(titleList === "conditional" ? "conditional" : "keep", result.duties, result.evidence);

        let failReason: FailReason | null = null;
        if (titleList === "drop") failReason = "title_drop_list";
        else if (titleList === "irrelevant") failReason = "title_irrelevant";
        else failReason = g.failReason;
        const failDetail = failReason === g.failReason ? g.failDetail : null;
        const ex = result.extraction;

        const data: ReportData = {
          company: company || ex.company || "Pasted posting",
          title: extractedTitle || "Untitled posting",
          locations: ex.location ? [ex.location] : [],
          text,
          duties: result.duties.map((d) => ({
            idx: d.idx, text: d.text, sourceSpan: d.source_span, spanStart: d.span_start, spanEnd: d.span_end, label: d.label,
            taskId: d.task_id, notCoveredKind: d.not_covered_kind, confidence: d.confidence, rationale: d.rationale,
          })),
          quotes: result.evidence.map((e) => ({ quote: e.quote, kind: e.kind, span_start: e.span_start, span_end: e.span_end })),
          droppedQuotes: result.droppedEvidence.map((e) => e.quote),
          notLive: ex.not_live_evidence,
          fields: {
            seniority: ex.seniority, agentType: ex.agent_type, tools: ex.agent_tools, pain: ex.pain_phrases, volumeHint: ex.volume_hint,
            firstEvalHire: ex.is_first_eval_hire, remote: ex.remote, location: ex.location,
          },
          salary: { min: ex.salary_min, max: ex.salary_max, currency: ex.currency, source: ex.salary_source, ranges: [] },
          gates: {
            ...g,
            titleList,
            titleNote: title?.check ? `Claude title check: ${title.check.decision}. ${title.check.reason}` : title ? `Matched the ${title.list} list.` : "Title not on any list.",
            passed: failReason === null,
            failReason,
            failDetail,
            failText: failReason ? FAIL_REASON_TEXT[failReason] : null,
          },
        };
        stage("scoring", "done");
        send({ type: "result", data });
      } catch (err) {
        // Log the failure type only, never the posting.
        console.error("analyze failed:", (err as Error).name);
        send({ type: "error", message: "Claude couldn't read this posting. Please try again in a moment." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
