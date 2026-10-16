import { validateSessionRequest } from "./mod.ts";

/** The subset of the Eurobase EdgeContext the handler needs. */
export interface SqlQuery {
  <T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
}

export interface HttpContext {
  db: { sql: SqlQuery };
  log?: { error: (msg: string, data?: unknown) => void };
}

export function sha256Hex(input: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(input))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

const SESSION_TTL_MS = 10 * 60 * 1000;

/** POST /api/session — mint a 10-minute session token for the demo venue. */
export async function handleRequest(_req: Request, ctx: HttpContext): Promise<Response> {
  try {
    // No API key: this is the public demo fixture (like /v1/beacon).
    const venueRows = await ctx.db.sql<{ id: string }>(
      "SELECT id FROM venues WHERE slug = 'ven_demo' LIMIT 1",
    );
    const venue = venueRows[0];
    if (!venue) {
      return errorResponse(500, "internal_error", "demo venue is not seeded");
    }

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await ctx.db.sql(
      "INSERT INTO sessions (venue_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [venue.id, tokenHash, expiresAt.toISOString()],
    );

    return Response.json(
      { session_token: token, expires_at: expiresAt.toISOString() },
      { status: 200 },
    );
  } catch (err) {
    ctx.log?.error("session internal error", { message: String(err) });
    return errorResponse(500, "internal_error", "internal server error");
  }
}

export { validateSessionRequest };
