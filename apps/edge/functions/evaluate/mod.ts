/**
 * Core of the /v1/evaluate Edge Function: deterministic rules-only scoring,
 * action mapping, idempotency, and persistence — with no Eurobase runtime
 * imports, so every path is unit-testable under plain `deno test` by injecting
 * a fake database, cache, clock and identity/beacon resolvers.
 */

export type Action = "allow" | "step_up" | "deny";
export type CancellationPolicy = "card_hold" | "none" | "free";

export interface Reason {
  code: string;
  weight: number;
  detail?: string;
}

export interface AgentInfo {
  verified: boolean;
  provider: string | null;
  method: "ip_list" | "web_bot_auth" | null;
}

/** Mirrors docs/openapi/agien-v0.yaml#/components/schemas/EvaluateRequest. */
export interface EvaluateRequest {
  session_token?: string;
  venue_id: string;
  request: {
    ip: string;
    user_agent: string;
    headers?: Record<string, string>;
  };
  booking: {
    cancellation_policy: CancellationPolicy;
    booking_hash?: string;
  };
  identity?: {
    declared_agent?: string | null;
    provider?: string | null;
  };
}

/** Mirrors docs/openapi/agien-v0.yaml#/components/schemas/EvaluateResponse. */
export interface EvaluateResponse {
  evaluation_id: string;
  p_agent: number;
  p_phantom: number;
  action: Action;
  reasons: Reason[];
  agent: AgentInfo;
  policy_version: string;
  latency_ms: number;
}

/** Result of declared-identity verification (see lib/identity). */
export interface IdentityResult {
  identified: boolean;
  verified: boolean;
  provider: string | null;
  method: "ip_list" | "web_bot_auth" | null;
}

export interface EvaluationRow {
  venue_id: string;
  session_token_hash: string | null;
  p_agent: number;
  p_phantom: number;
  action: Action;
  reasons: Reason[];
  policy_version: string;
  latency_ms: number;
}

/** Persistence port — the handler adapts `ctx.db.sql`, tests inject a fake. */
export interface EvaluateDb {
  insertEvaluation(row: EvaluationRow): Promise<{ id: string }>;
}

export interface CachedEvaluation {
  evaluationId: string;
  response: EvaluateResponse;
  storedAt: number;
}

/** Idempotency cache — the handler uses a per-instance Map, tests a fake. */
export interface IdempotencyCache {
  get(key: string): CachedEvaluation | null;
  set(key: string, value: CachedEvaluation): void;
}

export interface EvaluateDeps {
  db: EvaluateDb;
  cache: IdempotencyCache;
  clock: () => number;
  isDatacenterIp: (ip: string) => boolean;
  resolveIdentity: (request: EvaluateRequest) => Promise<IdentityResult>;
  resolveBeacon: (venueId: string, sessionToken?: string) => Promise<boolean>;
  log?: { error: (msg: string, data?: unknown) => void };
  idempotencyWindowMs?: number;
}

export const POLICY_VERSION = "v0";
export const DEFAULT_IDEMPOTENCY_WINDOW_MS = 60_000;

/** Map a phantom probability to an action (PDD 3.6 defaults). */
export function actionFor(p: number): Action {
  if (p < 0.3) return "allow";
  if (p <= 0.7) return "step_up";
  return "deny";
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export interface ScoreContext {
  identity: IdentityResult;
  hasBeaconSession: boolean;
  isDatacenter: boolean;
}

export interface Score {
  p_agent: number;
  p_phantom: number;
  reasons: Reason[];
  agent: AgentInfo;
}

/**
 * Rules v0 (pure, synchronous). p_agent starts at 0, additive signals raise
 * it, and a verified/spoofed declared identity raises a floor underneath it.
 */
export function score(request: EvaluateRequest, ctx: ScoreContext): Score {
  const reasons: Reason[] = [];
  let additive = 0;
  let floor = 0;

  if (ctx.isDatacenter) {
    additive += 0.4;
    reasons.push({ code: "datacenter_asn", weight: 0.4 });
  }
  if (!ctx.hasBeaconSession) {
    additive += 0.3;
    reasons.push({ code: "no_beacon_session", weight: 0.3 });
  }
  const headers = request.request.headers ?? {};
  if (!("accept-language" in headers)) {
    additive += 0.1;
    reasons.push({ code: "missing_accept_language", weight: 0.1 });
  }
  if (!("referer" in headers)) {
    additive += 0.1;
    reasons.push({ code: "missing_referer", weight: 0.1 });
  }

  let agent: AgentInfo = { verified: false, provider: null, method: null };
  if (ctx.identity.verified) {
    floor = 0.95;
    agent = {
      verified: true,
      provider: ctx.identity.provider,
      method: ctx.identity.method,
    };
    reasons.push({
      code: "verified_declared_identity",
      weight: 0.95,
      detail: ctx.identity.provider ?? undefined,
    });
  } else if (ctx.identity.identified && ctx.identity.method === "ip_list") {
    floor = 0.9;
    agent = { verified: false, provider: ctx.identity.provider, method: "ip_list" };
    reasons.push({
      code: "ua_publisher_ip_mismatch",
      weight: 0.9,
      detail: ctx.identity.provider ?? undefined,
    });
  }

  const p_agent = clamp01(Math.max(additive, floor));
  const adjustment = request.booking.cancellation_policy === "card_hold"
    ? -0.2
    : request.booking.cancellation_policy === "none"
    ? 0.1
    : 0;
  const p_phantom = clamp01(p_agent + adjustment);

  return { p_agent, p_phantom, reasons, agent };
}

/** Idempotency key over session token + booking hash, when both are present. */
export function idempotencyKey(request: EvaluateRequest): string | null {
  if (!request.session_token || !request.booking.booking_hash) return null;
  return `${request.session_token}|${request.booking.booking_hash}`;
}

function failSafe(latencyMs: number): EvaluateResponse {
  return {
    evaluation_id: crypto.randomUUID(),
    p_agent: 0,
    p_phantom: 0,
    action: "allow",
    reasons: [{ code: "agien_internal_error", weight: 1 }],
    agent: { verified: false, provider: null, method: null },
    policy_version: POLICY_VERSION,
    latency_ms: latencyMs,
  };
}

export async function evaluate(
  request: EvaluateRequest,
  deps: EvaluateDeps,
): Promise<EvaluateResponse> {
  const started = deps.clock();
  const windowMs = deps.idempotencyWindowMs ?? DEFAULT_IDEMPOTENCY_WINDOW_MS;
  try {
    const [identity, hasBeaconSession] = await Promise.all([
      deps.resolveIdentity(request),
      deps.resolveBeacon(request.venue_id, request.session_token),
    ]);
    const isDatacenter = deps.isDatacenterIp(request.request.ip);

    const cacheKey = idempotencyKey(request);
    if (cacheKey) {
      const hit = deps.cache.get(cacheKey);
      if (hit && started - hit.storedAt < windowMs) {
        return hit.response;
      }
    }

    const s = score(request, { identity, hasBeaconSession, isDatacenter });
    const latencyMs = deps.clock() - started;

    const { id } = await deps.db.insertEvaluation({
      venue_id: request.venue_id,
      session_token_hash: request.session_token ?? null,
      p_agent: s.p_agent,
      p_phantom: s.p_phantom,
      action: actionFor(s.p_phantom),
      reasons: s.reasons,
      policy_version: POLICY_VERSION,
      latency_ms: latencyMs,
    });

    const response: EvaluateResponse = {
      evaluation_id: id,
      p_agent: s.p_agent,
      p_phantom: s.p_phantom,
      action: actionFor(s.p_phantom),
      reasons: s.reasons,
      agent: s.agent,
      policy_version: POLICY_VERSION,
      latency_ms: latencyMs,
    };

    if (cacheKey) {
      deps.cache.set(cacheKey, { evaluationId: id, response, storedAt: deps.clock() });
    }
    return response;
  } catch (err) {
    deps.log?.error("evaluate internal error", { message: String(err) });
    return failSafe(deps.clock() - started);
  }
}
