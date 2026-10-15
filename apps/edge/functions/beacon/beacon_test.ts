import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest, type HttpContext, type SqlQuery } from "./http.ts";
import { validateBeaconRequest } from "./mod.ts";

// ---------------------------------------------------------------- validation

Deno.test("validate: accepts a well-formed beacon request", () => {
  assertEquals(
    validateBeaconRequest({
      session_token: "sess_abc123",
      feature_vector: { mouse_entropy: 0.83 },
    }).ok,
    true,
  );
});

Deno.test("validate: rejects a missing session_token", () => {
  const r = validateBeaconRequest({ feature_vector: {} });
  assertEquals(r.ok, false);
});

Deno.test("validate: rejects an empty session_token", () => {
  const r = validateBeaconRequest({ session_token: "  ", feature_vector: {} });
  assertEquals(r.ok, false);
});

Deno.test("validate: rejects a missing feature_vector", () => {
  const r = validateBeaconRequest({ session_token: "sess_abc123" });
  assertEquals(r.ok, false);
});

Deno.test("validate: rejects a non-object feature_vector", () => {
  const r = validateBeaconRequest({ session_token: "sess_abc123", feature_vector: 42 });
  assertEquals(r.ok, false);
});

Deno.test("validate: rejects a non-object body", () => {
  assertEquals(validateBeaconRequest("nope").ok, false);
});

// ---------------------------------------------------------------- handleRequest

type Rows = Record<string, unknown>[];

function fakeSql(
  rowsByQuery: Record<string, Rows>,
  onInsert?: (query: string) => void,
): SqlQuery {
  return <T = Record<string, unknown>>(query: string): Promise<T[]> => {
    if (query.includes("INSERT INTO beacons")) {
      onInsert?.(query);
      return Promise.resolve([]);
    }
    for (const [needle, rows] of Object.entries(rowsByQuery)) {
      if (query.includes(needle)) return Promise.resolve(rows as T[]);
    }
    return Promise.resolve([]);
  };
}

function postRequest(body: unknown): Request {
  return new Request("https://newtek.eurobase.app/v1/beacon", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctxWith(rowsByQuery: Record<string, Rows>, onInsert?: (q: string) => void): HttpContext {
  return { db: { sql: fakeSql(rowsByQuery, onInsert) } };
}

Deno.test("beacon: malformed JSON returns 400", async () => {
  const req = new Request("https://newtek.eurobase.app/v1/beacon", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  const resp = await handleRequest(req, ctxWith({}));
  assertEquals(resp.status, 400);
});

Deno.test("beacon: invalid body returns 400", async () => {
  const resp = await handleRequest(postRequest({ nope: true }), ctxWith({}));
  assertEquals(resp.status, 400);
});

Deno.test("beacon: unknown session token returns 400", async () => {
  const ctx = ctxWith({ "FROM sessions": [] });
  const resp = await handleRequest(
    postRequest({ session_token: "sess_unknown", feature_vector: { a: 1 } }),
    ctx,
  );
  assertEquals(resp.status, 400);
});

Deno.test("beacon: valid request stores the beacon and returns 200", async () => {
  let inserted = false;
  const ctx = ctxWith(
    { "FROM sessions": [{ id: "sess-id-1", venue_id: "venue-id-1" }] },
    () => {
      inserted = true;
    },
  );
  const resp = await handleRequest(
    postRequest({ session_token: "sess_abc123", feature_vector: { mouse_entropy: 0.83 } }),
    ctx,
  );
  assertEquals(resp.status, 200);
  assertEquals(inserted, true);
  assertEquals((await resp.json()) as { accepted: boolean }, { accepted: true });
});
