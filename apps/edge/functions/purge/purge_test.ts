import { assertEquals } from "jsr:@std/assert@1";
import { computeCutoff, DEFAULT_RETENTION_DAYS, purge, type PurgeDb } from "./mod.ts";

function db(overrides: Partial<PurgeDb> = {}): PurgeDb {
  return {
    deleteEvaluationsOlderThan: () => Promise.resolve(7),
    deleteOutcomesOlderThan: () => Promise.resolve(3),
    deleteExpiredSessions: () => Promise.resolve(2),
    ...overrides,
  };
}

Deno.test("computeCutoff subtracts the retention window", () => {
  const cutoff = computeCutoff(new Date("2026-01-31T00:00:00Z"), 30);
  assertEquals(cutoff.toISOString(), "2026-01-01T00:00:00.000Z");
});

Deno.test("purge deletes all three tables and reports counts + cutoff", async () => {
  const result = await purge(db(), { now: new Date("2026-01-31T00:00:00Z") });
  assertEquals(result.evaluations, 7);
  assertEquals(result.outcomes, 3);
  assertEquals(result.sessions, 2);
  assertEquals(
    result.cutoff,
    computeCutoff(new Date("2026-01-31T00:00:00Z"), DEFAULT_RETENTION_DAYS).toISOString(),
  );
});

Deno.test("purge honours a retention_days override", async () => {
  const result = await purge(db(), {
    now: new Date("2026-01-31T00:00:00Z"),
    retentionDays: 10,
  });
  assertEquals(result.cutoff, "2026-01-21T00:00:00.000Z");
});

Deno.test("purge fails safe: one table error zeroes its count and continues", async () => {
  const errors: unknown[] = [];
  const result = await purge(
    db({
      deleteOutcomesOlderThan: () => Promise.reject(new Error("outcomes down")),
    }),
    { now: new Date("2026-01-31T00:00:00Z"), log: { error: (_m, d) => errors.push(d) } },
  );
  assertEquals(result.evaluations, 7);
  assertEquals(result.outcomes, 0);
  assertEquals(result.sessions, 2);
  assertEquals(errors.length, 1);
});

Deno.test("purge returns counts even when db methods throw synchronously", () => {
  const bad: PurgeDb = {
    deleteEvaluationsOlderThan: () => {
      throw new Error("sync boom");
    },
    deleteOutcomesOlderThan: () => Promise.resolve(1),
    deleteExpiredSessions: () => Promise.resolve(1),
  };
  return purge(bad, { now: new Date("2026-01-31T00:00:00Z") }).then((r) => {
    assertEquals(r.evaluations, 0);
    assertEquals(r.outcomes, 1);
  });
});

// Red guard: purge never rejects even when every table fails.
Deno.test("purge never rejects", async () => {
  const bad: PurgeDb = {
    deleteEvaluationsOlderThan: () => Promise.reject(new Error("a")),
    deleteOutcomesOlderThan: () => Promise.reject(new Error("b")),
    deleteExpiredSessions: () => Promise.reject(new Error("c")),
  };
  const result = await purge(bad, { now: new Date() });
  assertEquals(result.evaluations + result.outcomes + result.sessions, 0);
});
