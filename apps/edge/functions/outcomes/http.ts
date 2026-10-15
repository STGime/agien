import { validateOutcomeRequest } from "./mod.ts";

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

function apiKeyToken(req: Request): string | null {
  const key = req.headers.get("x-api-key");
  if (!key || key.trim() === "") return null;
  return key.trim();
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function handleRequest(req: Request, ctx: HttpContext): Promise<Response> {
  // --- auth ---
  const token = apiKeyToken(req);
  if (!token) {
    return errorResponse(401, "missing_api_key", "x-api-key header is required");
  }
  const keyHash = await sha256Hex(token);
  const keyRows = await ctx.db.sql<{ venue_id: string; revoked_at: string | null }>(
    "SELECT venue_id, revoked_at FROM api_keys WHERE key_hash = $1 LIMIT 1",
    [keyHash],
  );
  const apiKey = keyRows[0];
  if (!apiKey || apiKey.revoked_at !== null) {
    return errorResponse(401, "invalid_api_key", "unknown or revoked API key");
  }

  // --- parse + validate ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "invalid_json", "request body is not valid JSON");
  }
  const validated = validateOutcomeRequest(body);
  if (!validated.ok) {
    return errorResponse(400, "invalid_request", validated.message);
  }
  const request = validated.value;

  // --- venue scoping: the evaluation must belong to the caller's venue ---
  const evalRows = await ctx.db.sql<{ venue_id: string }>(
    "SELECT venue_id FROM evaluations WHERE id = $1 LIMIT 1",
    [request.evaluation_id],
  );
  const evaluation = evalRows[0];
  if (!evaluation) {
    return errorResponse(404, "not_found", "evaluation not found");
  }
  if (evaluation.venue_id !== apiKey.venue_id) {
    return errorResponse(403, "venue_mismatch", "API key is not valid for this evaluation");
  }

  // --- record the outcome ---
  const reportedAt = request.reported_at ?? new Date().toISOString();
  await ctx.db.sql(
    "INSERT INTO outcomes (evaluation_id, venue_id, status, reported_at) VALUES ($1, $2, $3, $4)",
    [request.evaluation_id, apiKey.venue_id, request.status, reportedAt],
  );

  return new Response(null, { status: 204 });
}
