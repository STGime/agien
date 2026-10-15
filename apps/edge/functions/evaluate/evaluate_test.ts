import { assertEquals, assertGreaterOrEqual, assertLess } from "jsr:@std/assert@1";
import { validateEvaluateResponse } from "./contract.ts";
import { handleRequest, type HttpContext, type SqlQuery, validateEvaluateRequest } from "./http.ts";
import {
  actionFor,
  clamp01,
  evaluate,
  type EvaluateDeps,
  type EvaluateRequest,
  type EvaluateResponse,
  type IdempotencyCache,
  type IdentityResult,
  type Reason,
  score,
  type ScoreContext,
} from "./mod.ts";

const VENUE_A = "01926f8f-0000-0000-0000-000000000001";
const VENUE_B = "01926f8f-0000-0000-0000-000000000002";

const NONE_IDENTITY: IdentityResult = {
  identified: false,
  verified: false,
  provider: null,
  method: null,
};

function baseRequest(overrides: Partial<EvaluateRequest> = {}): EvaluateRequest {
  return {
    venue_id: VENUE_A,
    request: {
      ip: "198.51.100.10",
      user_agent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      headers: { "accept-language": "en-GB", "referer": "https://demo.example/booking" },
    },
    booking: { cancellation_policy: "free" },
    ...overrides,
  };
}

function baseCtx(overrides: Partial<ScoreContext> = {}): ScoreContext {
  return {
    identity: NONE_IDENTITY,
    hasBeaconSession: true,
    isDatacenter: false,
    ...overrides,
  };
}

function reasonCodes(s: { reasons: Reason[] }): string[] {
  return s.reasons.map((r) => r.code);
}

// ---------------------------------------------------------------- rules (score)

Deno.test("rule: verified declared identity sets p_agent floor 0.95 and agent.verified", () => {
  const s = score(
    baseRequest(),
    baseCtx({
      identity: { identified: true, verified: true, provider: "openai", method: "ip_list" },
    }),
  );
  assertEquals(s.p_agent, 0.95);
  assertEquals(s.agent.verified, true);
  assertEquals(s.agent.provider, "openai");
  assertEquals(reasonCodes(s).includes("verified_declared_identity"), true);
});

Deno.test("rule: spoofed publisher UA sets p_agent floor 0.9 with ua_publisher_ip_mismatch", () => {
  const s = score(
    baseRequest(),
    baseCtx({
      identity: { identified: true, verified: false, provider: "openai", method: "ip_list" },
    }),
  );
  assertEquals(s.p_agent, 0.9);
  assertEquals(s.agent.verified, false);
  assertEquals(reasonCodes(s).includes("ua_publisher_ip_mismatch"), true);
});

Deno.test("rule: datacenter ASN adds +0.4 with reason datacenter_asn", () => {
  const s = score(baseRequest(), baseCtx({ isDatacenter: true }));
  assertEquals(s.p_agent, 0.4);
  assertEquals(reasonCodes(s).includes("datacenter_asn"), true);
});

Deno.test("rule: no beacon session adds +0.3 with reason no_beacon_session", () => {
  const s = score(baseRequest(), baseCtx({ hasBeaconSession: false }));
  assertEquals(s.p_agent, 0.3);
  assertEquals(reasonCodes(s).includes("no_beacon_session"), true);
});

Deno.test("rule: missing Accept-Language adds +0.1", () => {
  const req = baseRequest({
    request: {
      ip: "198.51.100.10",
      user_agent: "ua",
      headers: { referer: "https://demo.example/booking" },
    },
  });
  const s = score(req, baseCtx());
  assertEquals(s.p_agent, 0.1);
  assertEquals(reasonCodes(s).includes("missing_accept_language"), true);
});

Deno.test("rule: missing Referer adds +0.1", () => {
  const req = baseRequest({
    request: {
      ip: "198.51.100.10",
      user_agent: "ua",
      headers: { "accept-language": "en" },
    },
  });
  const s = score(req, baseCtx());
  assertEquals(s.p_agent, 0.1);
  assertEquals(reasonCodes(s).includes("missing_referer"), true);
});

Deno.test("p_phantom adjusts by cancellation_policy and clamps to [0,1]", () => {
  const neutral = { identity: NONE_IDENTITY, hasBeaconSession: true, isDatacenter: false };
  assertEquals(
    score(baseRequest({ booking: { cancellation_policy: "card_hold" } }), neutral).p_phantom,
    0,
  );
  assertEquals(
    score(baseRequest({ booking: { cancellation_policy: "none" } }), neutral).p_phantom,
    0.1,
  );
  assertEquals(
    score(baseRequest({ booking: { cancellation_policy: "free" } }), neutral).p_phantom,
    0,
  );
  assertEquals(clamp01(1.5), 1);
  assertEquals(clamp01(-0.5), 0);
});

// ---------------------------------------------------------------- thresholds

Deno.test("thresholds: 0.29→allow, 0.30→step_up, 0.70→step_up, 0.71→deny", () => {
  assertEquals(actionFor(0.29), "allow");
  assertEquals(actionFor(0.3), "step_up");
  assertEquals(actionFor(0.7), "step_up");
  assertEquals(actionFor(0.71), "deny");
});

// ---------------------------------------------------------------- evaluate (orchestration)

function emptyCache(): IdempotencyCache {
  const map = new Map<
    string,
    { evaluationId: string; response: EvaluateResponse; storedAt: number }
  >();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
  };
}

function fastDeps(overrides: Partial<EvaluateDeps> = {}): EvaluateDeps {
  return {
    db: { insertEvaluation: () => Promise.resolve({ id: crypto.randomUUID() }) },
    cache: emptyCache(),
    clock: () => 0,
    isDatacenterIp: () => false,
    resolveIdentity: () => Promise.resolve(NONE_IDENTITY),
    resolveBeacon: () => Promise.resolve(true),
    ...overrides,
  };
}

Deno.test("evaluate assembles a contract-valid response", async () => {
  const response = await evaluate(baseRequest(), fastDeps());
  assertEquals(response.action, "allow");
  assertEquals(response.policy_version, "v0");
  const { ok } = validateEvaluateResponse(response);
  assertEquals(ok, true);
});

Deno.test("fail-safe: persistence error returns allow with agien_internal_error", async () => {
  const errors: unknown[] = [];
  const response = await evaluate(
    baseRequest(),
    fastDeps({
      db: {
        insertEvaluation: () => Promise.reject(new Error("boom")),
      },
      log: { error: (_msg, data) => errors.push(data) },
    }),
  );
  assertEquals(response.action, "allow");
  assertEquals(response.reasons[0].code, "agien_internal_error");
  assertEquals(errors.length, 1);
  const { ok } = validateEvaluateResponse(response);
  assertEquals(ok, true);
});

Deno.test("idempotency: same token+hash within 60s returns same evaluation_id, then a new one", async () => {
  let now = 0;
  let inserted = 0;
  const ids = ["eval-1", "eval-2", "eval-3"];
  const deps = fastDeps({
    clock: () => now,
    db: { insertEvaluation: () => Promise.resolve({ id: ids[inserted++] }) },
  });
  const req = baseRequest({
    session_token: "sess_abc",
    booking: { cancellation_policy: "free", booking_hash: "h1" },
  });

  const r1 = await evaluate(req, deps);
  const r2 = await evaluate(req, deps);
  assertEquals(r1.evaluation_id, r2.evaluation_id);
  assertEquals(inserted, 1);

  now = 61_000;
  const r3 = await evaluate(req, deps);
  assertEquals(r3.evaluation_id, "eval-2");
});

// ---------------------------------------------------------------- validation (handleRequest)

function fakeSql(rowsByQuery: Record<string, unknown[]>): SqlQuery {
  return <T = Record<string, unknown>>(query: string): Promise<T[]> => {
    for (const [needle, rows] of Object.entries(rowsByQuery)) {
      if (query.includes(needle)) return Promise.resolve(rows as T[]);
    }
    return Promise.resolve([]);
  };
}

function apiKeyRow(venueId: string, revoked = false): Record<string, unknown> {
  return { venue_id: venueId, revoked_at: revoked ? "2026-01-01T00:00:00Z" : null };
}

function postRequest(body: unknown, token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  return new Request("https://newtek.eurobase.app/v1/evaluate", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function ctxWith(rowsByQuery: Record<string, unknown[]>): HttpContext {
  return { db: { sql: fakeSql(rowsByQuery) } };
}

Deno.test("auth: missing API key returns 401", async () => {
  const resp = await handleRequest(postRequest(baseRequest()), ctxWith({}));
  assertEquals(resp.status, 401);
});

Deno.test("auth: revoked API key returns 401", async () => {
  const ctx = ctxWith({ "FROM api_keys": [apiKeyRow(VENUE_A, true)] });
  const resp = await handleRequest(postRequest(baseRequest(), "sk_revoked"), ctx);
  assertEquals(resp.status, 401);
});

Deno.test("auth: venue B key used for venue A returns 403", async () => {
  const ctx = ctxWith({ "FROM api_keys": [apiKeyRow(VENUE_B)] });
  const resp = await handleRequest(postRequest(baseRequest(), "sk_b"), ctx);
  assertEquals(resp.status, 403);
});

Deno.test("validation: invalid body returns 400 with error envelope", async () => {
  const ctx = ctxWith({ "FROM api_keys": [apiKeyRow(VENUE_A)] });
  const resp = await handleRequest(
    postRequest({ venue_id: "not-a-uuid", request: {}, booking: {} }, "sk_a"),
    ctx,
  );
  assertEquals(resp.status, 400);
  const json = (await resp.json()) as { error: { code: string; message: string } };
  assertEquals(json.error.code, "invalid_request");
  assertEquals(typeof json.error.message, "string");
});

Deno.test("validateEvaluateRequest accepts a well-formed request", () => {
  const result = validateEvaluateRequest(baseRequest());
  assertEquals(result.ok, true);
});

// ---------------------------------------------------------------- latency (mocked DB)

Deno.test("latency: p99 under 15 ms across 1000 sequential calls (mocked DB)", async () => {
  const deps = fastDeps();
  const req = baseRequest();
  const times: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    await evaluate(req, deps);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const p99 = times[Math.floor(times.length * 0.99)];
  console.log(`evaluate p99 (mocked DB): ${p99.toFixed(3)} ms`);
  assertLess(p99, 15);
  assertGreaterOrEqual(times.length, 1000);
});
