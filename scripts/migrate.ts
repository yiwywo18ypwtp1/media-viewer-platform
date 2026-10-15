import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { z } from "zod";
import { parseEnv } from "../src/server/env-schema";
import { createLogger } from "../src/server/logger";
import * as schema from "../src/server/schema";
import { seed } from "./seed";

const log = createLogger("migrate");

async function main() {
  const { DATABASE_URL } = parseEnv(z.object({ DATABASE_URL: z.url() }), process.env);
  const client = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  try {
    // Applied migrations are recorded in drizzle.__drizzle_migrations,
    // so running this on every `docker compose up` is safe.
    await migrate(db, { migrationsFolder: "./drizzle" });
    log.info("migrations applied");
    await seed(db);
    log.info("seed applied");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  log.error({ err: error }, "migration failed");
  process.exit(1);
});
