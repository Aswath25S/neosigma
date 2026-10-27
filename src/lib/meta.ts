import { eq } from "drizzle-orm";
import { getDb, schema } from "./db/client";

export function setMeta(key: string, value: unknown): void {
  getDb().insert(schema.meta).values({ key, value }).onConflictDoUpdate({ target: schema.meta.key, set: { value } }).run();
}

export function getMeta<T>(key: string): T | null {
  const row = getDb().select().from(schema.meta).where(eq(schema.meta.key, key)).get();
  return (row?.value as T) ?? null;
}
