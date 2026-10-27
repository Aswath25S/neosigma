import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export const DB_PATH = process.env.RADAR_DB ?? path.join(process.cwd(), "data", "radar.db");

type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const globalForDb = globalThis as unknown as { __radarDb?: Db };

// One connection per process; migrations run on first open so a fresh
// checkout only needs `npm run all`.
export function getDb(): Db {
  if (globalForDb.__radarDb) return globalForDb.__radarDb;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema }) as Db;
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  globalForDb.__radarDb = db;
  return db;
}

export { schema };
