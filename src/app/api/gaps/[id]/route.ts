import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";

const STATUSES = new Set(["Unreviewed", "Real gap", "Already covered", "Not relevant"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { status?: string } | null;
  if (!body?.status || !STATUSES.has(body.status)) {
    return Response.json({ error: "status must be one of: " + [...STATUSES].join(", ") }, { status: 400 });
  }
  const res = getDb().update(schema.gapThemes).set({ status: body.status }).where(eq(schema.gapThemes.id, Number(id))).run();
  if (!res.changes) return Response.json({ error: "theme not found" }, { status: 404 });
  return Response.json({ ok: true });
}
