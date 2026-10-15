# Contributing

## TDD (red → green)

1. Write the failing test first and commit it (the "red" commit).
2. Implement the smallest change that makes the test pass (the "green" commit).
3. Link the red commit in your pull request description.

## Branch naming

`agent/<specialist>/<issue-number>` — e.g. `agent/backend/4`.

## Before opening a pull request

- `make test` passes (all three suites: edge, js, ml).
- `make lint` passes.
- No secrets, PATs, API keys, or credentials are committed.

## Runtimes

- `apps/edge` — Deno (Edge Functions)
- `packages/beacon`, `packages/sdk-js` — Node / Vitest
- `apps/dashboard`, `apps/demo-site` — Svelte (Node)
- `ml/` — Python (uv + pytest)
