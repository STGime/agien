import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest, type HttpContext, type SqlQuery } from "./http.ts";

type Rows = Record<string, unknown>[];

function fakeSql(rowsByQuery: Record<string, Rows>): SqlQuery {
  return <T = Record<string, unknown>>(query: string): Promise<T[]> => {
    for (const [needle, rows] of Object.entries(rowsByQuery)) {
      if (query.includes(needle)) return Promise.resolve(rows as T[]);
    }
    return Promise.resolve([]);
  };
}

function ctxWith(rowsByQuery: Record<string, Rows>, now?: () => Date): HttpContext {
  return { db: { sql: fakeSql(rowsByQuery) }, now: now ?? (() => new Date()) };
}

const SLOT_BASE = {
  sold_out: false,
  is_hot: false,
  hot_release_minute: null,
  booked: false,
};

Deno.test("slots: missing date returns 400", async () => {
  const resp = await handleRequest(
    new Request("https://x/v1/functions/slots"),
    ctxWith({ "FROM venues": [{ id: "v1" }] }),
  );
  assertEquals(resp.status, 400);
});

Deno.test("slots: malformed date returns 400", async () => {
  const resp = await handleRequest(
    new Request("https://x/v1/functions/slots?date=not-a-date"),
    ctxWith({ "FROM venues": [{ id: "v1" }] }),
  );
  assertEquals(resp.status, 400);
});

Deno.test("slots: sold-out slot is available:false, normal slot available:true", async () => {
  const ctx = ctxWith({
    "FROM venues": [{ id: "v1" }],
    "FROM demo_slots": [
      { ...SLOT_BASE, id: "s-normal", start_time: "12:00:00", slot_date: "2026-10-20" },
      {
        ...SLOT_BASE,
        id: "s-sold",
        start_time: "21:00:00",
        slot_date: "2026-10-20",
        sold_out: true,
      },
    ],
  });
  const resp = await handleRequest(
    new Request("https://x/v1/functions/slots?date=2026-10-20"),
    ctx,
  );
  assertEquals(resp.status, 200);
  const body = await resp.json() as {
    slots: Array<{ id: string; available: boolean }>;
  };
  const byId = Object.fromEntries(body.slots.map((s) => [s.id, s.available]));
  assertEquals(byId["s-normal"], true);
  assertEquals(byId["s-sold"], false);
});

Deno.test("slots: hot slot is available only after its release minute (frozen clock)", async () => {
  const hot = {
    ...SLOT_BASE,
    id: "s-hot",
    start_time: "19:00:00",
    slot_date: "2026-10-20",
    is_hot: true,
    hot_release_minute: 660, // 11:00
  };
  const before = new Date("2026-10-20T10:59:00Z");
  const at = new Date("2026-10-20T11:00:00Z");

  const r1 = await handleRequest(
    new Request("https://x/v1/functions/slots?date=2026-10-20"),
    ctxWith({ "FROM venues": [{ id: "v1" }], "FROM demo_slots": [hot] }, () => before),
  );
  const b1 = await r1.json() as { slots: Array<{ id: string; available: boolean }> };
  assertEquals(b1.slots[0].available, false);

  const r2 = await handleRequest(
    new Request("https://x/v1/functions/slots?date=2026-10-20"),
    ctxWith({ "FROM venues": [{ id: "v1" }], "FROM demo_slots": [hot] }, () => at),
  );
  const b2 = await r2.json() as { slots: Array<{ id: string; available: boolean }> };
  assertEquals(b2.slots[0].available, true);
});

Deno.test("slots: booked slot is available:false", async () => {
  const ctx = ctxWith({
    "FROM venues": [{ id: "v1" }],
    "FROM demo_slots": [
      {
        ...SLOT_BASE,
        id: "s-booked",
        start_time: "12:00:00",
        slot_date: "2026-10-20",
        booked: true,
      },
    ],
  });
  const resp = await handleRequest(
    new Request("https://x/v1/functions/slots?date=2026-10-20"),
    ctx,
  );
  const body = await resp.json() as { slots: Array<{ available: boolean }> };
  assertEquals(body.slots[0].available, false);
});
