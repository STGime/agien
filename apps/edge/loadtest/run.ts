/**
 * Repeatable load-test harness for the deployed /v1/evaluate Edge Function.
 *
 * Run from the repo root (no project imports beyond ./stats.ts):
 *
 *   deno run --allow-net apps/edge/loadtest/run.ts \
 *     --url https://newtek.eurobase.app/v1/functions/evaluate \
 *     --apikey "$EUROBASE_API_KEY" \
 *     --venue-key sk_test_ven_test_a \
 *     --venue-id e71ee0d9-157d-4e4c-9964-f59ffbf0c5a1 \
 *     --location berlin \
 *     --concurrency 10 --requests 500
 *
 * Environment fallbacks: EUROBASE_API_KEY (apikey) and VENUE_API_KEY (venue-key).
 *
 * The workload is a fixed, documented mix (see WORKLOAD below). For every
 * request the harness records BOTH the client-observed round-trip time and the
 * server-reported `latency_ms` from the response body, so client/network
 * latency can be separated from server processing. Cold start (first request)
 * is reported separately. Results are written to --out as JSON plus a summary
 * line on stdout.
 */

import { type LatencySummary, summarize } from "./stats.ts";

interface RunConfig {
  url: string;
  apikey: string;
  venueKey: string;
  venueId: string;
  concurrency: number;
  requests: number;
  warmup: number;
  location: string;
  out: string;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return args[i + 1];
}

function required(v: string | undefined, name: string): string {
  if (!v) throw new Error(`missing required --${name}`);
  return v;
}

function parseConfig(args: string[]): RunConfig {
  const url = flag(args, "url") ?? "https://newtek.eurobase.app/v1/functions/evaluate";
  const apikey = flag(args, "apikey") ?? Deno.env.get("EUROBASE_API_KEY");
  const venueKey = flag(args, "venue-key") ?? Deno.env.get("VENUE_API_KEY");
  const venueId = flag(args, "venue-id");
  const location = flag(args, "location") ?? "unknown";
  return {
    url,
    apikey: required(apikey, "apikey"),
    venueKey: required(venueKey, "venue-key"),
    venueId: required(venueId, "venue-id"),
    concurrency: Number(flag(args, "concurrency") ?? "10"),
    requests: Number(flag(args, "requests") ?? "500"),
    warmup: Number(flag(args, "warmup") ?? "5"),
    location,
    out: flag(args, "out") ?? `loadtest-${location}.json`,
  };
}

/**
 * Representative request mix for Sprint 0. Every entry contributes a fraction
 * of the stream; weights are chosen to match a typical reservation flow:
 * mostly residential browser traffic, some datacenter (automation signal),
 * some with an (unknown) session token to exercise the beacon lookup.
 */
const WORKLOAD: ReadonlyArray<{ weight: number; body: () => Record<string, unknown> }> = [
  {
    weight: 0.6,
    body: () => ({
      request: {
        ip: "203.0.113.7",
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        headers: { "accept-language": "en", referer: "https://venue.example/booking" },
      },
      booking: { cancellation_policy: "card_hold" },
    }),
  },
  {
    weight: 0.2,
    body: () => ({
      request: {
        ip: "34.210.100.5", // AWS us-west-2 — inside the datacenter allowlist
        user_agent: "python-requests/2.31.0",
        headers: {},
      },
      booking: { cancellation_policy: "free" },
    }),
  },
  {
    weight: 0.2,
    body: () => ({
      session_token: `sess_${crypto.randomUUID()}`,
      request: {
        ip: "198.51.100.23",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        headers: { "accept-language": "de", referer: "https://venue.example/booking" },
      },
      booking: { cancellation_policy: "none" },
    }),
  },
];

function pickBody(): Record<string, unknown> {
  const r = Math.random();
  let acc = 0;
  for (const w of WORKLOAD) {
    acc += w.weight;
    if (r <= acc) return w.body();
  }
  return WORKLOAD[WORKLOAD.length - 1].body();
}

interface Sample {
  totalMs: number;
  serverMs: number | null;
  status: number;
  code: string | null;
}

interface RunResult {
  location: string;
  url: string;
  concurrency: number;
  requests: number;
  warmup: number;
  test_date: string;
  cold_start_ms: number;
  total: LatencySummary;
  server: LatencySummary;
  throughput_rps: number;
  error_rate: number;
  status_counts: Record<number, number>;
  error_codes: Record<string, number>;
}

async function oneRequest(cfg: RunConfig): Promise<Sample> {
  const body = { venue_id: cfg.venueId, ...pickBody() };
  const started = performance.now();
  let status = 0;
  let serverMs: number | null = null;
  let code: string | null = null;
  try {
    const resp = await fetch(cfg.url, {
      method: "POST",
      headers: {
        apikey: cfg.apikey,
        "x-api-key": cfg.venueKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    status = resp.status;
    try {
      const json = await resp.json() as Record<string, unknown>;
      const lat = (json as { latency_ms?: number }).latency_ms;
      if (typeof lat === "number") serverMs = lat;
      const err = (json as { error?: { code?: string } }).error;
      if (err?.code) code = err.code;
    } catch {
      // non-JSON body — leave serverMs/code null
    }
  } catch {
    status = 0;
    code = "network_error";
  }
  const totalMs = performance.now() - started;
  return { totalMs, serverMs, status, code };
}

async function main(): Promise<void> {
  const cfg = parseConfig(Deno.args);
  console.error(
    `loadtest: ${cfg.requests} requests @ ${cfg.concurrency} concurrency → ${cfg.url}`,
  );

  // --- warmup (also surfaces cold start) ---
  const cold = await oneRequest(cfg);
  for (let i = 0; i < cfg.warmup; i++) await oneRequest(cfg);

  // --- fixed concurrency pool: each worker pulls the next index ---
  const totals: number[] = [];
  const servers: number[] = [];
  const statuses: Record<number, number> = {};
  const codes: Record<string, number> = {};
  let errors = 0;
  let next = 0;

  const started = performance.now();
  await Promise.all(
    Array.from({ length: cfg.concurrency }, async () => {
      while (true) {
        const i = next++;
        if (i >= cfg.requests) return;
        const s = await oneRequest(cfg);
        totals.push(s.totalMs);
        if (s.serverMs !== null) servers.push(s.serverMs);
        statuses[s.status] = (statuses[s.status] ?? 0) + 1;
        if (s.code) {
          codes[s.code] = (codes[s.code] ?? 0) + 1;
          errors++;
        }
        if (s.status >= 400) errors++;
      }
    }),
  );
  const elapsedMs = performance.now() - started;

  const result: RunResult = {
    location: cfg.location,
    url: cfg.url,
    concurrency: cfg.concurrency,
    requests: cfg.requests,
    warmup: cfg.warmup,
    test_date: new Date().toISOString(),
    cold_start_ms: cold.totalMs,
    total: summarize(totals),
    server: summarize(servers),
    throughput_rps: (cfg.requests / elapsedMs) * 1000,
    error_rate: errors / cfg.requests,
    status_counts: statuses,
    error_codes: codes,
  };

  await Deno.writeTextFile(cfg.out, JSON.stringify(result, null, 2) + "\n");
  console.log(
    `${cfg.location}: ${cfg.requests} req @ ${cfg.concurrency}c | ` +
      `client p50=${result.total.p50.toFixed(1)}ms p95=${result.total.p95.toFixed(1)}ms ` +
      `p99=${result.total.p99.toFixed(1)}ms | server p50=${result.server.p50.toFixed(1)}ms ` +
      `p99=${result.server.p99.toFixed(1)}ms | ${result.throughput_rps.toFixed(1)} rps | ` +
      `errors=${(result.error_rate * 100).toFixed(2)}% | cold=${result.cold_start_ms.toFixed(0)}ms`,
  );
  console.log(`  results → ${cfg.out}`);
}

if (import.meta.main) {
  await main();
}
