# Agien

Agentic greenfield build: intent/automation detection for EU reservation and
scheduling SaaS.

## Layout

- `apps/edge` — Deno Edge Functions (`evaluate`, `beacon`)
- `packages/beacon` — browser behavioural-telemetry library (Node / Vitest)
- `packages/sdk-js` — Eurobase SDK client wrapper (stub)
- `apps/dashboard` — Svelte dashboard (stub)
- `apps/demo-site` — reservation/scheduling demo (stub)
- `ml/` — Python training & evaluation (uv + pytest)
- `docs/` — design, contracts, research

## Prerequisites

- Deno 2 (Edge Functions): https://deno.land
- Node 22 + npm (beacon / dashboard / sdk)
- uv (Python toolchain): https://docs.astral.sh/uv

## Running tests

```bash
make test          # all suites: edge, js, ml, contract
make test-edge     # Deno
make test-js       # Vitest (beacon)
make test-ml       # pytest
make test-contract # OpenAPI spec + examples (Vitest, in packages/contract)
make lint          # lint all runtimes + contract
```

First run of `make test-js` requires `cd packages/beacon && npm install`;
`make test-ml` resolves its environment automatically via `uv run`;
`make test-contract` requires `cd packages/contract && npm install`.

## API contract (OpenAPI 3.1)

The Sprint 0 request/response shapes live in `docs/openapi/agien-v0.yaml`,
with example fixtures in `docs/openapi/examples/{valid,invalid}/`. TypeScript
types are generated from the spec into `packages/contract/generated/` and
committed. Regenerate them after a spec change with:

```bash
cd packages/contract && npm run generate
```

`packages/contract` asserts the spec parses and lints clean (Redocly, OpenAPI
3.1 rules), that every example fixture validates against its schema (ajv),
and that the generated types compile under `tsc --noEmit` with the fixtures
type-checked against them.

## Identity verifier

`apps/edge/lib/identity/` is a pure, side-effect-free library that answers
"does this request carry a verifiable declared agent identity?" through two
methods:

- Publisher User-Agent + published IP ranges (`ChatGPT-User`, `ClaudeBot`, …).
- Web Bot Auth (RFC 9421) Ed25519 signatures.

IP ranges are vendored snapshots under `data/ip-lists/`, refreshed with:

```bash
deno run --allow-net --allow-write scripts/refresh_ip_lists.ts
```

Run the tests with `make test-edge`; `webbotauth.ts` targets 100% branch
coverage and the fixture benchmark must stay under a 2 ms median.

## Database (schema migrations)

`apps/edge/migrations/` holds numbered, idempotent SQL migrations — `venues`,
`api_keys`, `sessions`, `evaluations`, `outcomes` — each with per-venue
row-level security, plus a seed (`ven_test_a` / `ven_test_b`).

```bash
make db-reset   # docker compose up Postgres, apply migrations + seed
make test-db    # migrations + RLS tests against local Postgres
```

`make test-db` needs `DATABASE_URL` (defaults to the local docker Postgres) and
Docker daemon access. In CI the `db` job provides Postgres as a service
container, so the same tests run on every PR without a local database.

## Evaluate function

`apps/edge/functions/evaluate/` implements `POST /v1/evaluate`:

- `mod.ts` — pure rules engine (`score`, `actionFor`, `evaluate`) with injected
  db / cache / clock / identity / beacon resolvers, so it is unit-tested without
  the Eurobase runtime. Rules v0: verified declared identity (floor 0.95),
  spoofed publisher UA (floor 0.9), datacenter ASN (+0.4), no beacon session
  (+0.3), missing Accept-Language / Referer (+0.1 each). `p_phantom` adjusts
  `p_agent` by `cancellation_policy` and is clamped to `[0,1]`; actions map
  `< 0.3 allow`, `0.3–0.7 step_up`, `> 0.7 deny`. Fail-safe returns
  `allow` + `agien_internal_error` on any internal error.
- `http.ts` — auth (bearer key → `api_keys.key_hash`), request validation,
  venue scoping, and the orchestration pipeline (`handleRequest`), testable
  against a fake `db.sql`.
- `index.ts` — the deployed `EdgeHandler`, adapting the Eurobase `ctx` surface.
- `datacenter.ts` — static v0 datacenter CIDR allowlist (MaxMind pending).
- `contract.ts` — validates responses against `docs/openapi/agien-v0.yaml`.

Run the tests with `make test-edge`; the latency test asserts p99 < 15 ms over
1,000 sequential calls with the database mocked.

### Deploying (pending)

Deployment to the Eurobase `newtek` project requires the `eurobase` CLI plus
explicit approval (the `newtek` project does not yet carry the Agien schema).
Once deployed, the function is exercised with:

```bash
curl -sS https://newtek.eurobase.app/functions/v1/evaluate \
  -H "Authorization: Bearer sk_test_ven_test_a" \
  -H "Content-Type: application/json" \
  -d '{"venue_id":"<venue-uuid>","request":{"ip":"203.0.113.7","user_agent":"Mozilla/5.0","headers":{"accept-language":"en"}},"booking":{"cancellation_policy":"card_hold"}}'
```

## Retention purge

`apps/edge/functions/purge/` is a scheduled job that deletes rows past the
approved retention window: `evaluations` / `outcomes` older than the cutoff
(default 30 days, placeholder pending the Legal retention schedule in #14) and
expired `sessions`. Each table is purged independently; a failure on one is
logged and zeroed rather than crashing the run. The result (cutoff + per-table
counts) is returned for audit.

Run the tests with `make test-edge`. Deployment and the cron schedule are
pending the same Eurobase CLI + approval as the evaluate function; the schedule
is declared with `eb.functions.schedules.createOrUpdate(...)` once deployed.

See `CONTRIBUTING.md` for the TDD (red-first) workflow and branch naming.
