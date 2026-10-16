import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest, sha256Hex, type HttpContext, type SqlQuery } from "./http.ts";

type Rows = Record<string, unknown>[];
type Call = { query: string; params: unknown[] };

function fakeSql(
  rowsByQuery: Record<string, Rows>,
  onCall?: (query: string, params: unknown[]) => void,
): SqlQuery {
  return <T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> => {
    onCall?.(query, params);
    for (const [needle, rows] of Object.entries(rowsByQuery)) {
      if (query.includes(needle)) return Promise.resolve(rows as T[]);
    }
    return Promise.resolve([]);
  };
}

Deno.test("session: mints a token and stores only its sha256 hash", async () => {
  const calls: Call[] = [];
  const ctx: HttpContext = {
    db: {
      sql: fakeSql({ "FROM venues": [{ id: "venue-demo-1" }] }, (q, p) =>
        calls.push({ query: q, params: p })),
    },
  };
  const resp = await handleRequest(
    new Request("https://x/v1/functions/session", { method: "POST" }),
    ctx,
  );
  assertEquals(resp.status, 200);
  const body = await resp.json() as { session_token: string; expires_at: string };
  assertEquals(body.session_token.length, 64);
  const insert = calls.find((c) => c.query.includes("INSERT INTO sessions"));
  assertEquals(insert !== undefined, true);
  const storedHash = insert!.params[1] as string;
  assertEquals(storedHash, await sha256Hex(body.session_token));
  assertEquals(storedHash === body.session_token, false);
});

Deno.test("session: returns an expiry about 10 minutes out", async () => {
  const ctx: HttpContext = { db: { sql: fakeSql({ "FROM venues": [{ id: "v" }] }) } };
  const before = Date.now();
  const resp = await handleRequest(
    new Request("https://x/v1/functions/session", { method: "POST" }),
    ctx,
  );
  const body = await resp.json() as { expires_at: string };
  const delta = Date.parse(body.expires_at) - before;
  assertEquals(delta > 9 * 60 * 1000, true);
  assertEquals(delta < 11 * 60 * 1000, true);
});

Deno.test("session: missing demo venue is an internal error", async () => {
  const ctx: HttpContext = { db: { sql: fakeSql({}) } };
  const resp = await handleRequest(
    new Request("https://x/v1/functions/session", { method: "POST" }),
    ctx,
  );
  assertEquals(resp.status, 500);
});
