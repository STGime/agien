import { vendoredIpLists } from "../../lib/identity/ip_lists.ts";
import { verify } from "../../lib/identity/verify.ts";
import type { IdentityRequest } from "../../lib/identity/types.ts";
import { isDatacenterIp } from "./datacenter.ts";
import {
  type CachedEvaluation,
  type CancellationPolicy,
  evaluate,
  type EvaluateRequest,
  type EvaluateResponse,
  type IdempotencyCache,
  type IdentityResult,
} from "./mod.ts";

/** The subset of the Eurobase EdgeContext the handler needs. */
export interface SqlQuery {
  <T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
}

export interface HttpContext {
  db: { sql: SqlQuery };
  log?: { error: (msg: string, data?: unknown) => void };
}

export interface HandleDeps {
  clock?: () => number;
  cache?: IdempotencyCache;
  isDatacenterIp?: (ip: string) => boolean;
  resolveIdentity?: (request: EvaluateRequest) => Promise<IdentityResult>;
  resolveBeacon?: (venueId: string, sessionToken?: string) => Promise<boolean>;
}

const CANCEL_POLICIES: readonly CancellationPolicy[] = ["card_hold", "none", "free"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sha256Hex(input: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(input))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
}

export type Validation =
  | { ok: true; value: EvaluateRequest }
  | { ok: false; message: string };

/** Focused structural validation mirroring the EvaluateRequest schema in #2. */
export function validateEvaluateRequest(body: unknown): Validation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.venue_id !== "string" || !UUID_RE.test(b.venue_id)) {
    return { ok: false, message: "venue_id must be a UUID string" };
  }
  if (typeof b.request !== "object" || b.request === null) {
    return { ok: false, message: "request is required" };
  }
  const request = b.request as Record<string, unknown>;
  if (typeof request.ip !== "string" || request.ip === "") {
    return { ok: false, message: "request.ip must be a non-empty string" };
  }
  if (typeof request.user_agent !== "string" || request.user_agent === "") {
    return { ok: false, message: "request.user_agent must be a non-empty string" };
  }
  if (
    request.headers !== undefined &&
    (typeof request.headers !== "object" || request.headers === null)
  ) {
    return { ok: false, message: "request.headers must be an object" };
  }
  if (typeof b.booking !== "object" || b.booking === null) {
    return { ok: false, message: "booking is required" };
  }
  const booking = b.booking as Record<string, unknown>;
  if (
    typeof booking.cancellation_policy !== "string" ||
    !CANCEL_POLICIES.includes(booking.cancellation_policy as CancellationPolicy)
  ) {
    return {
      ok: false,
      message: `booking.cancellation_policy must be one of ${CANCEL_POLICIES.join(", ")}`,
    };
  }
  if (b.session_token !== undefined && typeof b.session_token !== "string") {
    return { ok: false, message: "session_token must be a string" };
  }
  if (booking.booking_hash !== undefined && typeof booking.booking_hash !== "string") {
    return { ok: false, message: "booking.booking_hash must be a string" };
  }

  const value: EvaluateRequest = {
    venue_id: b.venue_id,
    session_token: typeof b.session_token === "string" ? b.session_token : undefined,
    request: {
      ip: request.ip,
      user_agent: request.user_agent,
      headers: request.headers as Record<string, string> | undefined,
    },
    booking: {
      cancellation_policy: booking.cancellation_policy as CancellationPolicy,
      booking_hash: typeof booking.booking_hash === "string" ? booking.booking_hash : undefined,
    },
  };
  return { ok: true, value };
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function apiKeyToken(req: Request): string | null {
  const key = req.headers.get("x-api-key");
  if (!key || key.trim() === "") return null;
  return key.trim();
}

const defaultCache: IdempotencyCache = (() => {
  const map = new Map<string, CachedEvaluation>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
  };
})();

export async function handleRequest(
  req: Request,
  ctx: HttpContext,
  deps: HandleDeps = {},
): Promise<Response> {
  const clock = deps.clock ?? (() => Date.now());

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

  // --- parse + validate body ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "invalid_json", "request body is not valid JSON");
  }
  const validated = validateEvaluateRequest(body);
  if (!validated.ok) {
    return errorResponse(400, "invalid_request", validated.message);
  }
  const request = validated.value;

  // --- venue match ---
  if (apiKey.venue_id !== request.venue_id) {
    return errorResponse(403, "venue_mismatch", "API key is not valid for this venue");
  }

  // --- resolve identity / beacon with real implementations unless overridden ---
  const resolveIdentity = deps.resolveIdentity ??
    (async (r: EvaluateRequest): Promise<IdentityResult> => {
      const identityRequest: IdentityRequest = {
        method: "POST",
        url: "https://evaluate.invalid/",
        ip: r.request.ip,
        userAgent: r.request.user_agent,
        headers: r.request.headers ?? {},
      };
      const out = await verify(identityRequest, {
        resolveJwks: () => Promise.resolve(null),
        ipLists: vendoredIpLists,
      });
      return {
        identified: out.identified,
        verified: out.verified,
        provider: out.provider,
        method: out.method,
      };
    });

  const resolveBeacon = deps.resolveBeacon ??
    (async (venueId: string, sessionToken?: string): Promise<boolean> => {
      if (!sessionToken) return false;
      const tokenHash = await sha256Hex(sessionToken);
      const rows = await ctx.db.sql(
        "SELECT id FROM sessions WHERE venue_id = $1 AND token_hash = $2 AND expires_at > now() LIMIT 1",
        [venueId, tokenHash],
      );
      return rows.length > 0;
    });

  const result = await evaluate(request, {
    db: {
      insertEvaluation: async (row) => {
        const rows = await ctx.db.sql<{ id: string }>(
          `INSERT INTO evaluations
             (venue_id, session_token_hash, p_agent, p_phantom, action, reasons, policy_version, latency_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            row.venue_id,
            row.session_token_hash,
            row.p_agent,
            row.p_phantom,
            row.action,
            JSON.stringify(row.reasons),
            row.policy_version,
            row.latency_ms,
          ],
        );
        return { id: rows[0].id };
      },
    },
    cache: deps.cache ?? defaultCache,
    clock,
    isDatacenterIp: deps.isDatacenterIp ?? isDatacenterIp,
    resolveIdentity,
    resolveBeacon,
    log: ctx.log,
  });

  return Response.json(result satisfies EvaluateResponse, { status: 200 });
}
