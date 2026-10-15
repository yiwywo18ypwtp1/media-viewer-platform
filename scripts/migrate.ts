import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { z } from "zod";
import { parseEnv } from "../src/server/env-schema";
import { createLogger } from "../src/server/logger";

const log = createLogger("migrate");

async function main() {
  const { DATABASE_URL } = parseEnv(z.object({ DATABASE_URL: z.url() }), process.env);
  const client = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

  try {
    // Applied migrations are recorded in drizzle.__drizzle_migrations,
    // so running this on every `docker compose up` is safe.
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    log.info("migrations applied");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  log.error({ err: error }, "migration failed");
  process.exit(1);
});
