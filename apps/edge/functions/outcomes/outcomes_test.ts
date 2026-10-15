import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest, type HttpContext, type SqlQuery } from "./http.ts";
import { validateOutcomeRequest } from "./mod.ts";

const EVAL_ID = "01926f8f-0000-0000-0000-000000000002";
const VENUE_A = "01926f8f-0000-0000-0000-000000000001";
const VENUE_B = "01926f8f-0000-0000-0000-000000000002";

// ---------------------------------------------------------------- validation

Deno.test("validate: accepts a well-formed outcome request", () => {
  assertEquals(validateOutcomeRequest({ evaluation_id: EVAL_ID, status: "seated" }).ok, true);
});

Deno.test("validate: rejects an unknown status", () => {
  const r = validateOutcomeRequest({ evaluation_id: EVAL_ID, status: "pending" });
  assertEquals(r.ok, false);
});

Deno.test("validate: rejects a malformed evaluation_id", () => {
  const r = validateOutcomeRequest({ evaluation_id: "nope", status: "seated" });
  assertEquals(r.ok, false);
});

Deno.test("validate: rejects a missing status", () => {
  const r = validateOutcomeRequest({ evaluation_id: EVAL_ID });
  assertEquals(r.ok, false);
});

// ---------------------------------------------------------------- handleRequest

type Rows = Record<string, unknown>[];

function fakeSql(rowsByQuery: Record<string, Rows>, onInsert?: (q: string) => void): SqlQuery {
  return <T = Record<string, unknown>>(query: string): Promise<T[]> => {
    if (query.includes("INSERT INTO outcomes")) {
      onInsert?.(query);
      return Promise.resolve([]);
    }
    for (const [needle, rows] of Object.entries(rowsByQuery)) {
      if (query.includes(needle)) return Promise.resolve(rows as T[]);
    }
    return Promise.resolve([]);
  };
}

function apiKeyRow(venueId: string, revoked = false): Rows[number] {
  return { venue_id: venueId, revoked_at: revoked ? "2026-01-01T00:00:00Z" : null };
}

function postRequest(body: unknown, token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) headers["x-api-key"] = token;
  return new Request("https://newtek.eurobase.app/v1/outcomes", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function ctxWith(rowsByQuery: Record<string, Rows>, onInsert?: (q: string) => void): HttpContext {
  return { db: { sql: fakeSql(rowsByQuery, onInsert) } };
}

Deno.test("auth: missing API key returns 401", async () => {
  const resp = await handleRequest(
    postRequest({ evaluation_id: EVAL_ID, status: "seated" }),
    ctxWith({}),
  );
  assertEquals(resp.status, 401);
});

Deno.test("outcome: unknown evaluation returns 404", async () => {
  const ctx = ctxWith({ "FROM api_keys": [apiKeyRow(VENUE_A)], "FROM evaluations": [] });
  const resp = await handleRequest(
    postRequest({ evaluation_id: EVAL_ID, status: "seated" }, "sk_a"),
    ctx,
  );
  assertEquals(resp.status, 404);
});

Deno.test("outcome: evaluation of another venue returns 403", async () => {
  const ctx = ctxWith({
    "FROM api_keys": [apiKeyRow(VENUE_A)],
    "FROM evaluations": [{ venue_id: VENUE_B }],
  });
  const resp = await handleRequest(
    postRequest({ evaluation_id: EVAL_ID, status: "seated" }, "sk_a"),
    ctx,
  );
  assertEquals(resp.status, 403);
});

Deno.test("outcome: valid request inserts the row and returns 200", async () => {
  let inserted = false;
  const ctx = ctxWith(
    { "FROM api_keys": [apiKeyRow(VENUE_A)], "FROM evaluations": [{ venue_id: VENUE_A }] },
    () => {
      inserted = true;
    },
  );
  const resp = await handleRequest(
    postRequest({ evaluation_id: EVAL_ID, status: "no_show" }, "sk_a"),
    ctx,
  );
  assertEquals(resp.status, 200);
  assertEquals(inserted, true);
  assertEquals((await resp.json()) as { recorded: boolean }, { recorded: true });
});
