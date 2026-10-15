import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "./env";

function createDb() {
  const client = postgres(getEnv().DATABASE_URL, { max: 10, connect_timeout: 5 });
  return drizzle(client);
}

// Kept on globalThis so `next dev` hot reloads don't open a new pool each time.
const globalForDb = globalThis as unknown as { db?: ReturnType<typeof createDb> };

export function getDb() {
  globalForDb.db ??= createDb();
  return globalForDb.db;
}
