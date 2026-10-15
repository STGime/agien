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

See `CONTRIBUTING.md` for the TDD (red-first) workflow and branch naming.
