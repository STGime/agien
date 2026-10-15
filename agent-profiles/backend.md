# Backend Agent — Evaluation API, Beacon Ingestion & Rules Engine

## Mission
Implement secure, observable, low-latency backend primitives for intent/automation evaluation: `evaluate` and `beacon` Edge Functions, feature-store tables, rules engine, secret handling, retention purge, and performance tests.

## Dependencies
- Read root `AGENTS.md` and inspect the current database, Edge Function runtime, auth, migration, and deployment conventions.
- Agree with Data and ML agents on a versioned feature schema and request/response contract before locking interfaces.
- Treat p99 < 50 ms as a target to measure under a documented workload, not a claim to make without evidence.

## Eurobase operations (MCP + function deploy)

### Schema migrations via MCP

- Use `runSQLTransaction` — pass each statement as its own array element; it
  runs in one transaction and rolls everything back on any failure. `runSQL`
  runs a SINGLE statement only (multi-statement input is rejected). `createTable`
  is fine for simple tables (no FK/UNIQUE/CHECK constraints).
- Statements the MCP refuses: `uuid_generate_v4()` (use `gen_random_uuid()`,
  core PostgreSQL 13+, no extension); `SECURITY DEFINER` functions (use plain
  functions + RLS, or edge functions); anything `pg_`-prefixed (catalog); any
  write to system tables; `DO $$ … $$` blocks.
- The platform ships `public.is_service_role()` (returns true for the
  service/DDL role and for edge-function `ctx.db.sql`). Reference it UNQUALIFIED
  and do NOT redefine it — redefining shadows it in `search_path` and breaks the
  service-role RLS bypass. The tenant schema is a per-project schema, separate
  from `public`.
- Migrations must be idempotent: `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF
  EXISTS`, `CREATE OR REPLACE FUNCTION`, `ON CONFLICT … DO NOTHING` on seeds.
- Precompute seed hashes (e.g. SHA-256 of test keys) instead of relying on
  `pgcrypto`/`digest`; store keys as hex digests, never plaintext.

### Deploying edge functions via curl

- Endpoint: `https://api.eurobase.app/platform/projects/<projectId>/functions`.
  `PUT /{name}` updates, `POST /` creates. Auth: `Authorization: Bearer <PAT>`
  (the same management PAT the MCP uses, e.g. `$EUROBASE_NEWTEK_PAT`). Body:
  `{code, verify_jwt}` (+ `name` on POST).
- `verify_jwt` is a boolean: `false` for public/API-key routes, `true` only when
  the route needs the end-user JWT (`ctx.user`).
- Bundle multi-file functions to one self-contained file first:
  `deno bundle entry.ts -o out.js` (inlines relative imports and `import … with
  { type: "json" }` fixtures). The platform runs a single `code` string; relative
  imports to other files will not resolve. `@eurobase/sdk/functions` is
  types-only and elides cleanly.
- Invocation URL: `https://<project>.eurobase.app/v1/functions/<name>`.

### Function invocation auth (two-layered)

- The gateway requires the PROJECT key in the lowercase `apikey` header.
- `Authorization: Bearer` is reserved for end-user JWTs — a non-JWT value there
  is rejected with "invalid or expired token".
- App-level keys (e.g. per-venue keys checked against `api_keys.key_hash`) go in
  a custom header such as `x-api-key`, never `Authorization`.

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
