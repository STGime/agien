import { validateBookRequest } from "./mod.ts";

/** The subset of the Eurobase EdgeContext the handler needs. */
export interface SqlQuery {
  <T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
}

export interface HttpContext {
  db: { sql: SqlQuery };
  log?: { error: (msg: string, data?: unknown) => void };
  now?: () => Date;
}

export function sha256Hex(input: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(input))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

interface SessionRow {
  id: string;
  venue_id: string;
  expires_at: Date | string;
}

interface SlotRow {
  id: string;
  venue_id: string;
  slot_date: string;
  sold_out: boolean;
  is_hot: boolean;
  hot_release_minute: number | null;
}

/** POST /api/book — validate the session token, then book the slot. */
export async function handleRequest(req: Request, ctx: HttpContext): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, "invalid_json", "request body is not valid JSON");
    }
    const validated = validateBookRequest(body);
    if (!validated.ok) {
      return errorResponse(400, "invalid_request", validated.message);
    }
    const request = validated.value;

    // --- session token: resolve + check expiry (unknown → 400, expired → 410) ---
    const tokenHash = await sha256Hex(request.session_token);
    const sessionRows = await ctx.db.sql<SessionRow>(
      "SELECT id, venue_id, expires_at FROM sessions WHERE token_hash = $1 LIMIT 1",
      [tokenHash],
    );
    const session = sessionRows[0];
    if (!session) {
      return errorResponse(400, "invalid_session_token", "unknown session token");
    }
    const now = (ctx.now ?? (() => new Date()))();
    if (new Date(session.expires_at).getTime() <= now.getTime()) {
      return errorResponse(410, "session_expired", "session token has expired");
    }

    // --- slot: must exist, belong to the session venue, and be bookable ---
    const slotRows = await ctx.db.sql<SlotRow>(
      "SELECT id, venue_id, slot_date::text AS slot_date, sold_out, is_hot, hot_release_minute FROM demo_slots WHERE id = $1::uuid LIMIT 1",
      [request.slot_id],
    );
    const slot = slotRows[0];
    if (!slot) {
      return errorResponse(404, "not_found", "slot not found");
    }
    if (slot.venue_id !== session.venue_id) {
      return errorResponse(403, "venue_mismatch", "slot does not belong to the session venue");
    }
    if (slot.sold_out) {
      return errorResponse(409, "slot_sold_out", "slot is sold out");
    }
    if (slot.is_hot && slot.hot_release_minute !== null) {
      const release = new Date(`${slot.slot_date}T00:00:00Z`);
      release.setUTCMinutes(slot.hot_release_minute);
      if (now.getTime() < release.getTime()) {
        return errorResponse(409, "slot_not_released", "slot is not yet released");
      }
    }

    // --- duplicate check + insert (race-safe via UNIQUE(slot_id)) ---
    const existing = await ctx.db.sql(
      "SELECT slot_id FROM demo_bookings WHERE slot_id = $1::uuid LIMIT 1",
      [request.slot_id],
    );
    if (existing.length > 0) {
      return errorResponse(409, "slot_taken", "slot is already booked");
    }

    await ctx.db.sql(
      `INSERT INTO demo_bookings (slot_id, venue_id, session_token_hash, name, email, phone, notes, party_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        request.slot_id,
        session.venue_id,
        tokenHash,
        request.name,
        request.email,
        request.phone ?? null,
        request.notes ?? null,
        request.party_size,
      ],
    );

    return Response.json({ booked: true, slot_id: request.slot_id }, { status: 200 });
  } catch (err) {
    if (String(err).includes("duplicate key")) {
      return errorResponse(409, "slot_taken", "slot is already booked");
    }
    ctx.log?.error("book internal error", { message: String(err) });
    return errorResponse(500, "internal_error", "internal server error");
  }
}
