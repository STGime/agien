import { validateBeaconRequest } from "./mod.ts";

/** The subset of the Eurobase EdgeContext the handler needs. */
export interface SqlQuery {
  <T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
}

export interface HttpContext {
  db: { sql: SqlQuery };
  log?: { error: (msg: string, data?: unknown) => void };
}

function sha256Hex(input: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(input))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function handleRequest(req: Request, ctx: HttpContext): Promise<Response> {
  try {
    // --- parse + validate (no API key; caller is identified by session token) ---
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, "invalid_json", "request body is not valid JSON");
    }
    const validated = validateBeaconRequest(body);
    if (!validated.ok) {
      return errorResponse(400, "invalid_request", validated.message);
    }
    const request = validated.value;

    // --- resolve the active session for this token ---
    const tokenHash = await sha256Hex(request.session_token);
    const sessionRows = await ctx.db.sql<{ id: string; venue_id: string }>(
      "SELECT id, venue_id FROM sessions WHERE token_hash = $1 AND expires_at > now() ORDER BY created_at DESC LIMIT 1",
      [tokenHash],
    );
    const session = sessionRows[0];
    if (!session) {
      return errorResponse(400, "unknown_session_token", "unknown or expired session token");
    }

    // --- store the feature vector (raw field values are never stored) ---
    await ctx.db.sql(
      "INSERT INTO beacons (session_id, venue_id, feature_vector) VALUES ($1, $2, $3::jsonb)",
      [session.id, session.venue_id, JSON.stringify(request.feature_vector)],
    );

    return Response.json({ accepted: true }, { status: 200 });
  } catch (err) {
    ctx.log?.error("beacon internal error", { message: String(err) });
    return errorResponse(500, "internal_error", "internal server error");
  }
}
