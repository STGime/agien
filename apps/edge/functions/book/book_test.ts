import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest, type HttpContext, type SqlQuery } from "./http.ts";

type Rows = Record<string, unknown>[];

/** Fake db with a small in-memory demo_bookings store to test double-booking. */
function bookingDb() {
  const bookings: string[] = []; // slot_ids already booked
  return {
    bookings,
    sql: <T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> => {
      if (query.includes("FROM venues")) {
        return Promise.resolve([{ id: "venue-demo-1" }] as T[]);
      }
      if (query.includes("FROM sessions")) {
        // session lookup by token_hash: params[0] is the hash
        const hash = params[0] as string;
        if (hash === "expired") {
          return Promise.resolve([{ id: "sess-expired", venue_id: "venue-demo-1" }] as T[]);
        }
        if (hash === "valid") {
          return Promise.resolve([{ id: "sess-valid", venue_id: "venue-demo-1" }] as T[]);
        }
        return Promise.resolve([] as T[]);
      }
      if (query.includes("FROM demo_slots")) {
        return Promise.resolve([
          { id: "slot-1", venue_id: "venue-demo-1", sold_out: false, is_hot: false },
        ] as T[]);
      }
      if (query.includes("FROM demo_bookings")) {
        return Promise.resolve(
          bookings.map((slotId) => ({ slot_id: slotId })) as T[],
        );
      }
      if (query.includes("INSERT INTO demo_bookings")) {
        const slotId = params[0] as string;
        if (bookings.includes(slotId)) {
          throw new Error("duplicate key");
        }
        bookings.push(slotId);
        return Promise.resolve([{ id: "booking-1" }] as T[]);
      }
      return Promise.resolve([] as T[]);
    },
  };
}

function ctx(db: ReturnType<typeof bookingDb>): HttpContext {
  return { db: { sql: db.sql as SqlQuery } };
}

function post(body: unknown): Request {
  return new Request("https://x/v1/functions/book", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("book: missing session_token returns 400", async () => {
  const db = bookingDb();
  const resp = await handleRequest(
    post({ slot_id: "slot-1", name: "A", email: "a@b.c", party_size: 2 }),
    ctx(db),
  );
  assertEquals(resp.status, 400);
});

Deno.test("book: unknown session token returns 400", async () => {
  const db = bookingDb();
  const resp = await handleRequest(
    post({ session_token: "nope", slot_id: "slot-1", name: "A", email: "a@b.c", party_size: 2 }),
    ctx(db),
  );
  assertEquals(resp.status, 400);
});

Deno.test("book: expired session token returns 410", async () => {
  const db = bookingDb();
  const resp = await handleRequest(
    post({ session_token: "expired", slot_id: "slot-1", name: "A", email: "a@b.c", party_size: 2 }),
    ctx(db),
  );
  assertEquals(resp.status, 410);
});

Deno.test("book: valid request stores the booking and returns 200", async () => {
  const db = bookingDb();
  const resp = await handleRequest(
    post({
      session_token: "valid",
      slot_id: "slot-1",
      name: "Ada",
      email: "ada@example.com",
      party_size: 2,
    }),
    ctx(db),
  );
  assertEquals(resp.status, 200);
  assertEquals(db.bookings.length, 1);
  assertEquals(db.bookings[0], "slot-1");
});

Deno.test("book: double-booking the same slot returns 409 and leaves one row", async () => {
  const db = bookingDb();
  const first = await handleRequest(
    post({ session_token: "valid", slot_id: "slot-1", name: "A", email: "a@b.c", party_size: 2 }),
    ctx(db),
  );
  assertEquals(first.status, 200);

  const second = await handleRequest(
    post({ session_token: "valid", slot_id: "slot-1", name: "B", email: "b@c.d", party_size: 3 }),
    ctx(db),
  );
  assertEquals(second.status, 409);
  assertEquals(db.bookings.length, 1);
});
