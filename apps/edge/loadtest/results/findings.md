# Load-test findings — /v1/evaluate (Sprint 0)

Test date: 2026-10-16. Target: `https://newtek.eurobase.app/v1/functions/evaluate`
(fr-par). Client: Vodafone residential line, Mecklenburg-Vorpommern (DE).

## Workload shape

`apps/edge/loadtest/run.ts` drives a fixed mix: 60% residential browser traffic
(card_hold, full headers), 20% datacenter IP (free), 20% unknown session token
(none). No booking_hash, so the idempotency cache is never hit — every request
runs the full auth → identity → beacon-lookup → insert path.

## Results

| run | concurrency | client p50 / p95 / p99 | server p50 / p99 | throughput | errors |
|-----|-------------|------------------------|------------------|------------|--------|
| berlin-1 | 10 | 623 / 1170 / 1473 ms | 1 / 454 ms | 15.1 rps | 0% |
| berlin-2 | 20 | 1132 / 2640 / 3152 ms | 1 / 1033 ms | 15.7 rps | 0% |
| berlin-seq | 1 | 249 / 365 / 496 ms | 1 / 41 ms | 3.8 rps | 0% |

Cold start (first request after idle): 5437 ms (run 1), 697 ms (run 2), 5699 ms
(sequential run). Highly variable — a single cold request can cost seconds.

## Findings

1. **Function code is fast.** Server `latency_ms` is p50 = 1 ms across all runs.
   The rules engine + validation are not the bottleneck.

2. **Client RTT floor is ~250 ms, and it dominates wall latency.** At concurrency
   1 the client p50 is 249 ms while the server p50 is 1 ms. The gap is
   network distance (Vodafone DE → fr-par) plus gateway/TLS overhead, not the
   function.

3. **Throughput caps at ~15 rps regardless of concurrency.** 10c and 20c both
   deliver ~15 rps; doubling concurrency only adds per-request queueing (client
   p50 623 → 1132 ms). This is consistent with a gateway/functions-runner
   concurrency cap, not a client-side limit.

4. **Server tail latency degrades with concurrency** — p99 41 ms @ 1c → 454 ms
   @ 10c → 1033 ms @ 20c. Platform logs show per-invocation `duration_ms` of
   200–3000 ms even though the function's own `latency_ms` is 1 ms. The tail is
   spent outside the function code (auth DB lookup, connection acquisition,
   runner scheduling), and grows with load.

## Bottleneck + remediation

The 50 ms p99 server budget is met at low concurrency (41 ms @ 1c) but not
under sustained load. The bottleneck is the shared functions-runner and its DB
connection path, not the Agien rules engine.

Prioritized remediation:

1. **Confirm the concurrency cap with Eurobase** — is ~15 rps a per-project
   limit on the current tier? If so, this is a platform sizing question, not a
   code change. The latency budget is only meaningful once the runner can
   accept the target concurrency.
2. **Re-test from a colocated client** (Paris) to remove the ~250 ms network
   floor from the picture — deferred, needs a Paris host.
3. **Consider async/batched evaluation persistence** if the DB insert proves
   to be the tail contributor under load (it is on the critical path today).
4. **Cold start**: a 5.4 s cold request is a real UX risk. Mitigations to
   evaluate: a keep-warm cron ping, or accepting it for Sprint 0 (v0 has no
   warm-pool guarantee).

No changes to function code are indicated by this data; the median path is
already at 1 ms.
