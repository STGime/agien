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

See `CONTRIBUTING.md` for the TDD (red-first) workflow and branch naming.
