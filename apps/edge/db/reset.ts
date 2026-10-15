import { connectWithRetry, runMigrations, runSeed } from "./run.ts";

const url = Deno.env.get("DATABASE_URL");
if (!url) {
  console.error("DATABASE_URL is not set");
  Deno.exit(1);
}

const MIGRATIONS = new URL("../migrations/", import.meta.url);
const client = await connectWithRetry(url);
try {
  await client.queryObject(
    "DROP TABLE IF EXISTS outcomes, evaluations, sessions, api_keys, venues CASCADE",
  );
  const applied = await runMigrations(client, MIGRATIONS);
  await runSeed(client, new URL("seed.sql", MIGRATIONS));
  console.log(`db-reset complete: ${applied.length} migrations applied + seed`);
} finally {
  await client.end();
}
