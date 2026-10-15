import { assertEquals } from "jsr:@std/assert@1";
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

async function asService(client: Client, fn: () => Promise<void>): Promise<void> {
  await client.queryObject`SELECT set_config('app.service_role', 'true', false)`;
  await client.queryObject`SELECT set_config('app.venue_id', '', false)`;
  try {
    await fn();
  } finally {
    await client.queryObject`SELECT set_config('app.service_role', '', false)`;
  }
}

Deno.test({
  name: "migrations: apply to an empty db, then re-apply is a no-op",
  ignore: !DATABASE_URL,
  fn: async () => {
    const client = await connectWithRetry(DATABASE_URL!);
    try {
      await resetSchema(client);
      const first = await runMigrations(client, MIGRATIONS);
      assertEquals(first.length, 6);
      const second = await runMigrations(client, MIGRATIONS);
      assertEquals(second.length, 6);
    } finally {
      await client.end();
    }
  },
});

Deno.test({
  name: "api_keys.key_hash stores a sha256 digest, never the plaintext key",
  ignore: !DATABASE_URL,
  fn: async () => {
    const client = await connectWithRetry(DATABASE_URL!);
    try {
      await resetSchema(client);
      await runMigrations(client, MIGRATIONS);
      await asService(client, async () => {
        await runSeed(client, new URL("seed.sql", MIGRATIONS));
      });
      const r = await client.queryObject<{ key_hash: string }>(
        "SELECT key_hash FROM api_keys ORDER BY key_hash LIMIT 1",
      );
      const hash = r.rows[0].key_hash;
      assertEquals(hash.length, 64);
      assertEquals(/^[0-9a-f]{64}$/.test(hash), true);
      assertEquals(hash.includes("sk_test_"), false);
    } finally {
      await client.end();
    }
  },
});

Deno.test({
  name: "sessions.expires_at defaults to created_at + 10 minutes",
  ignore: !DATABASE_URL,
  fn: async () => {
    const client = await connectWithRetry(DATABASE_URL!);
    try {
      await resetSchema(client);
      await runMigrations(client, MIGRATIONS);
      await asService(client, async () => {
        await runSeed(client, new URL("seed.sql", MIGRATIONS));
      });
      const v = await client.queryObject<{ id: string }>(
        "SELECT id FROM venues WHERE slug = 'ven_test_a'",
      );
      await client.queryObject`INSERT INTO sessions (venue_id, token_hash) VALUES (${
        v.rows[0].id
      }, 'token_hash')`;
      const s = await client.queryObject<{ created_at: Date; expires_at: Date }>(
        "SELECT created_at, expires_at FROM sessions LIMIT 1",
      );
      const diff = s.rows[0].expires_at.getTime() - s.rows[0].created_at.getTime();
      assertEquals(diff, 10 * 60 * 1000);
    } finally {
      await client.end();
    }
  },
});
