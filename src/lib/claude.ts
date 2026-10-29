import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { sha256 } from "./text";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  client ??= new Anthropic({ maxRetries: 4 });
  return client;
}

export class ClaudeOutputError extends Error {}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface StructuredCall<S extends z.ZodType> {
  model: string;
  system: string;
  user: string;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
  // Called with the accumulated output text as it streams (live demo chips).
  onText?: (soFar: string) => void;
  tools?: Anthropic.Beta.BetaToolUnion[];
}

// Haiku has no server-side refusal fallback; Sonnet 5.5 and Opus 5.5 take the
// "default" fallback chain, which reroutes a declined request in-call.
function supportsFallback(model: string): boolean {
  return /sonnet-5-5|opus-5-5|opus-5$|fable/.test(model);
}

// Waits out rate limits beyond the SDK's own retries: a large pipeline run
// can saturate a tokens-per-minute limit for a while.
export async function structuredCall<S extends z.ZodType>(call: StructuredCall<S>): Promise<z.infer<S>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await structuredCallOnce(call);
    } catch (err) {
      if (!(err instanceof Anthropic.RateLimitError) || attempt >= 8) throw err;
      const wait = Math.min(120, 15 * 2 ** Math.min(attempt, 3)) * 1000 * (0.75 + Math.random() / 2);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function structuredCallOnce<S extends z.ZodType>(call: StructuredCall<S>): Promise<z.infer<S>> {
  const anthropic = getClient();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const betas = supportsFallback(call.model) ? ["server-side-fallback-2026-07-01"] : [];
    const stream = anthropic.beta.messages.stream({
      model: call.model,
      max_tokens: call.maxTokens ?? 32000,
      ...(betas.length ? { betas, fallbacks: "default" as const } : {}),
      system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: call.user }],
      output_config: {
        effort: call.effort ?? "medium",
        // Server tools (web search) can't be combined with a forced format.
        ...(call.tools ? {} : { format: betaZodOutputFormat(call.schema) }),
      },
      ...(call.tools ? { tools: call.tools } : {}),
    });
    if (call.onText) {
      let soFar = "";
      stream.on("text", (delta) => {
        soFar += delta;
        call.onText!(soFar);
      });
    }
    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
    } catch (err) {
      // The SDK validates structured output itself; a malformed answer is
      // retried like any other invalid JSON.
      if (err instanceof Error && /Failed to parse structured output/.test(err.message)) {
        lastError = err;
        continue;
      }
      throw err;
    }
    if (msg.stop_reason === "refusal") {
      throw new ClaudeOutputError("Claude declined to process this text.");
    }
    if (msg.stop_reason === "max_tokens") {
      lastError = new ClaudeOutputError("Output hit the token limit before the JSON was complete.");
      continue;
    }
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      const json = JSON.parse(call.tools ? extractJson(text) : text);
      return call.schema.parse(json);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new ClaudeOutputError(String(lastError));
}

// For calls that use server tools, the JSON arrives at the end of free text.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new ClaudeOutputError("No JSON object in response");
  return text.slice(start, end + 1);
}

// Vercel's deployed files are read-only, so any cache write there goes to /tmp.
const CACHE_DIR = process.env.VERCEL ? path.join("/tmp", "claude-cache") : path.join(process.cwd(), "data", "cache", "claude");

// Pipeline results are cached by a hash of (kind, model, prompt, input) so a
// re-run only pays for postings or prompts that changed.
export async function cached<T>(kind: string, keyParts: string[], fn: () => Promise<T>): Promise<T> {
  const key = sha256(keyParts.join("\u0000"));
  const file = path.join(CACHE_DIR, kind, `${key}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  const value = await fn();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return value;
}

export function hasApiKey(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
