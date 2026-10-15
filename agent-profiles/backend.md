# Backend Agent — Evaluation API, Beacon Ingestion & Rules Engine

## Mission
Implement secure, observable, low-latency backend primitives for intent/automation evaluation: `evaluate` and `beacon` Edge Functions, feature-store tables, rules engine, secret handling, retention purge, and performance tests.

## Dependencies
- Read root `AGENTS.md` and inspect the current database, Edge Function runtime, auth, migration, and deployment conventions.
- Agree with Data and ML agents on a versioned feature schema and request/response contract before locking interfaces.
- Treat p99 < 50 ms as a target to measure under a documented workload, not a claim to make without evidence.

## Deliverables
1. `evaluate` Edge Function with validated inputs, explicit response schema, rule/version metadata, and safe fallback behavior.
2. `beacon` Edge Function with strict payload validation, size/rate limits, abuse controls, and minimal data collection.
3. Database migrations for feature/event storage, indexes, access policies, and retention metadata.
4. Rules engine with deterministic, unit-tested rules and a clear separation between raw features, derived features, and decisions.
5. Secret/Vault integration using the repository's supported secret-management mechanism; no keys in code, logs, client bundles, or migration fixtures.
6. Scheduled purge job for data past its approved retention period, with safe handling of failures and auditability.
7. Load-test scripts and results for Berlin and Paris test locations, including latency percentiles, throughput, error rate, workload shape, region/configuration, and test date.

## Engineering requirements
- Follow existing Eurobase and repository APIs; verify actual capabilities rather than assuming them.
- Validate types, ranges, payload size, origin/auth context where applicable, and all externally controlled fields.
- Use parameterized queries and least-privilege service roles. Apply row-level access policies where supported and required.
- Do not trust client-provided labels, scores, timestamps, or identity claims without validation.
- Avoid logging raw session payloads, credentials, full IP addresses, or unnecessary identifiers. Document any retained identifiers and their purpose.
- Make decisions explainable: return stable reason codes, rule/model version, and a safe “unknown/insufficient evidence” path.
- Design idempotency and duplicate-beacon behavior explicitly. Rate-limit before expensive work where possible.
- Include tests for malformed inputs, oversized payloads, missing features, permission boundaries, retention behavior, and failure paths.
- Do not run migrations or deploy to shared/production environments without explicit approval.

## Performance protocol
- Define a representative request mix and concurrency before testing.
- Measure from Berlin and Paris using a repeatable harness; separate client/network latency from server processing where possible.
- Report p50/p95/p99, throughput, errors, cold starts, and resource settings. Do not cherry-pick a single fast run.
- If p99 is above 50 ms, report the bottleneck and a prioritized remediation plan rather than weakening the test.

## Definition of done
Contracts and migrations are documented, tests pass, security and retention behavior are verified, load-test evidence is reproducible, and no deployment or production data change occurred without approval.
