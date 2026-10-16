import { type DemoSlotRow, toAvailability, validateDateParam } from "./mod.ts";

/** The subset of the Eurobase EdgeContext the handler needs. */
export interface SqlQuery {
  <T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
}

export interface HttpContext {
  db: { sql: SqlQuery };
  log?: { error: (msg: string, data?: unknown) => void };
  now?: () => Date;
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/** GET /api/slots?date=YYYY-MM-DD — availability for the demo venue. */
export async function handleRequest(req: Request, ctx: HttpContext): Promise<Response> {
  try {
    const date = new URL(req.url).searchParams.get("date");
    const validated = validateDateParam(date);
    if (!validated.ok) {
      return errorResponse(400, "invalid_request", validated.message);
    }

    const venueRows = await ctx.db.sql<{ id: string }>(
      "SELECT id FROM venues WHERE slug = 'ven_demo' LIMIT 1",
    );
    const venue = venueRows[0];
    if (!venue) {
      return errorResponse(500, "internal_error", "demo venue is not seeded");
    }

    const rows = await ctx.db.sql<DemoSlotRow>(
      `SELECT s.id, s.slot_date::text AS slot_date, s.start_time::text AS start_time,
              s.sold_out, s.is_hot, s.hot_release_minute,
              (b.id IS NOT NULL) AS booked
         FROM demo_slots s
         LEFT JOIN demo_bookings b ON b.slot_id = s.id
        WHERE s.venue_id = $1 AND s.slot_date = $2::date
        ORDER BY s.start_time`,
      [venue.id, validated.value],
    );

    const now = (ctx.now ?? (() => new Date()))();
    const slots = rows.map((r) => toAvailability(r, now));
    return Response.json({ date: validated.value, slots }, { status: 200 });
  } catch (err) {
    ctx.log?.error("slots internal error", { message: String(err) });
    return errorResponse(500, "internal_error", "internal server error");
  }
}
