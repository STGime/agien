import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { connectWithRetry, runMigrations, runSeed } from "./run.ts";
import type { Client } from "jsr:@db/postgres@0.19.5";

function env(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

const DATABASE_URL = env("DATABASE_URL");
const MIGRATIONS = new URL("../migrations/", import.meta.url);

async function resetSchema(client: Client): Promise<void> {
  await client.queryObject(
    "DROP TABLE IF EXISTS outcomes, evaluations, sessions, api_keys, venues CASCADE",
  );
}

async function venueId(client: Client, slug: string): Promise<string> {
  const r = await client.queryObject<{ id: string }>`SELECT id FROM venues WHERE slug = ${slug}`;
  return r.rows[0].id;
}

Deno.test({
  name: "RLS: venue A sees only its own evaluations; cross-venue insert is rejected",
  ignore: !DATABASE_URL,
  fn: async () => {
    const client = await connectWithRetry(DATABASE_URL!);
    try {
      await resetSchema(client);
      await runMigrations(client, MIGRATIONS);

      // Seed as service, and create one evaluation per venue.
      await client.queryObject`SELECT set_config('app.service_role', 'true', false)`;
      await client.queryObject`SELECT set_config('app.venue_id', '', false)`;
      await runSeed(client, new URL("seed.sql", MIGRATIONS));
      const va = await venueId(client, "ven_test_a");
      const vb = await venueId(client, "ven_test_b");
      await client
        .queryObject`INSERT INTO evaluations (venue_id, p_agent, p_phantom, action, policy_version) VALUES (${va}, 0.9, 0.9, 'allow', 'v0')`;
      await client
        .queryObject`INSERT INTO evaluations (venue_id, p_agent, p_phantom, action, policy_version) VALUES (${vb}, 0.1, 0.1, 'deny', 'v0')`;

      // As venue A (service off): only venue A's row is visible.
      await client.queryObject`SELECT set_config('app.service_role', '', false)`;
      await client.queryObject`SELECT set_config('app.venue_id', ${va}, false)`;
      const mine = await client.queryObject<{ action: string }>(
        "SELECT action FROM evaluations",
      );
      assertEquals(mine.rows.length, 1);
      assertEquals(mine.rows[0].action, "allow");

      // Cross-venue insert must be rejected by the WITH CHECK policy.
      await assertRejects(
        () =>
          client
            .queryObject`INSERT INTO evaluations (venue_id, p_agent, p_phantom, action, policy_version) VALUES (${vb}, 0.5, 0.5, 'deny', 'v0')`,
      );

      // Service role bypasses RLS and sees everything.
      await client.queryObject`SELECT set_config('app.service_role', 'true', false)`;
      await client.queryObject`SELECT set_config('app.venue_id', '', false)`;
      const all = await client.queryObject<{ action: string }>(
        "SELECT action FROM evaluations",
      );
      assertEquals(all.rows.length, 2);
    } finally {
      await client.end();
    }
  },
});
