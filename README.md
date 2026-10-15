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
make test        # all suites: edge, js, ml
make test-edge   # Deno
make test-js     # Vitest
make test-ml     # pytest
make lint        # lint all three runtimes
```

First run of `make test-js` requires `cd packages/beacon && npm install`;
`make test-ml` resolves its environment automatically via `uv run`.

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

See `CONTRIBUTING.md` for the TDD (red-first) workflow and branch naming.
