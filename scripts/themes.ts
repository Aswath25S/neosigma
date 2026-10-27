// npm run themes
// Groups not-covered duties into themes with Claude: possible gaps (the
// roadmap view) and human work (collapsed on the Gaps page). Status values
// the founders set are kept across re-runs when a theme keeps its name.

import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/client";
import { cached, hasApiKey, structuredCall } from "../src/lib/claude";
import { MODELS } from "../src/lib/config";
import { ThemesSchema } from "../src/lib/schemas";
import { refreshThemeStats } from "../src/lib/gapstats";
import { sha256 } from "../src/lib/text";

const SYSTEM = fs.readFileSync(path.join(process.cwd(), "prompts", "themes.md"), "utf8");

async function group(kind: "possible_gap" | "human_work") {
  const db = getDb();
  const rows = db.select().from(schema.duties).where(eq(schema.duties.notCoveredKind, kind)).all();
  if (!rows.length) return { kind, themes: 0, duties: 0 };
  const user = rows.map((d) => `${d.id}: ${d.text} — "${d.sourceSpan}"`).join("\n");
  const result = await cached("themes", [MODELS.themes, sha256(SYSTEM), kind, user], () =>
    structuredCall({ model: MODELS.themes, system: SYSTEM, user, schema: ThemesSchema, effort: "medium", maxTokens: 32000 }),
  );

  const previous = db.select().from(schema.gapThemes).where(eq(schema.gapThemes.kind, kind)).all();
  const statusByName = new Map(previous.map((t) => [t.name.toLowerCase(), t.status]));
  db.update(schema.duties).set({ gapThemeId: null }).where(inArray(schema.duties.id, rows.map((r) => r.id))).run();
  db.delete(schema.gapThemes).where(eq(schema.gapThemes.kind, kind)).run();

  const valid = new Set(rows.map((r) => r.id));
  const assigned = new Set<number>();
  for (const t of result.themes) {
    const ids = t.duty_ids.filter((id) => valid.has(id) && !assigned.has(id));
    if (!ids.length) continue;
    ids.forEach((id) => assigned.add(id));
    const inserted = db.insert(schema.gapThemes).values({
      name: t.name, kind, description: t.description,
      status: statusByName.get(t.name.toLowerCase()) ?? "Unreviewed",
    }).returning({ id: schema.gapThemes.id }).get();
    db.update(schema.duties).set({ gapThemeId: inserted.id }).where(inArray(schema.duties.id, ids)).run();
  }
  // Ids Claude left out go to "Other" rather than vanishing.
  const left = rows.map((r) => r.id).filter((id) => !assigned.has(id));
  if (left.length) {
    let other = db.select().from(schema.gapThemes).all().find((t) => t.kind === kind && t.name === "Other");
    other ??= db.insert(schema.gapThemes).values({ name: "Other", kind, description: "Duties that fit no other theme.", status: statusByName.get("other") ?? "Unreviewed" }).returning().get();
    db.update(schema.duties).set({ gapThemeId: other.id }).where(inArray(schema.duties.id, left)).run();
  }
  return { kind, themes: result.themes.length, duties: rows.length, unassigned: left.length };
}

async function main() {
  if (!hasApiKey()) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  console.log(await group("possible_gap"));
  console.log(await group("human_work"));
  refreshThemeStats();
}

main();
