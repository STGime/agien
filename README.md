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

The same migrations are applied to the Eurobase `newtek` project via the MCP
`runSQLTransaction` (each statement its own array element). They are portable:
UUID defaults use `gen_random_uuid()` (PostgreSQL 13+ core, no extension),
seed API keys are precomputed SHA-256 hex digests, and `is_service_role()` is
referenced unqualified so it resolves to the platform-shipped function on
Eurobase (it is redefined only for local Postgres, which lacks it).

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
- `http.ts` — auth (venue key in `x-api-key` → `api_keys.key_hash`), request
  validation, venue scoping, and the orchestration pipeline (`handleRequest`),
  testable against a fake `db.sql`.
- `index.ts` — the deployed `EdgeHandler`, adapting the Eurobase `ctx` surface.
- `datacenter.ts` — static v0 datacenter CIDR allowlist (MaxMind pending).
- `contract.ts` — validates responses against `docs/openapi/agien-v0.yaml`.

Run the tests with `make test-edge`; the latency test asserts p99 < 15 ms over
1,000 sequential calls with the database mocked.

### Deployed

The Agien schema and the `evaluate`, `outcomes`, `purge` and `beacon` functions
are live in the `newtek` project. Deploy uses the platform API or the MCP
`deployFunction` tool (`PUT /{name}` to update, `POST /` to create), with the
function bundled to a single file via `deno bundle`:

```bash
deno bundle apps/edge/functions/evaluate/index.ts -o /tmp/evaluate.bundle.js
jq -n --rawfile code /tmp/evaluate.bundle.js '{code: $code, verify_jwt: false}' \
  | curl -sS -X PUT "https://api.eurobase.app/platform/projects/93df6379-8b4c-4056-8e61-647bffd9aa7c/functions/evaluate" \
      -H "Authorization: Bearer $EUROBASE_NEWTEK_PAT" -H "Content-Type: application/json" --data-binary @-
```

Invocation needs two headers: the Eurobase project key (`apikey`) for the
gateway, and the venue key (`x-api-key`) which the function hashes against
`api_keys.key_hash`. (`x-api-key` rather than `Authorization: Bearer` because
the Eurobase gateway reserves `Authorization: Bearer` for end-user JWTs.)

```bash
curl -sS https://newtek.eurobase.app/v1/functions/evaluate \
  -H "apikey: $EUROBASE_API_KEY" \
  -H "x-api-key: sk_test_ven_test_a" \
  -H "Content-Type: application/json" \
  -d '{"venue_id":"<venue-uuid>","request":{"ip":"203.0.113.7","user_agent":"Mozilla/5.0","headers":{"accept-language":"en"}},"booking":{"cancellation_policy":"card_hold"}}'
```

## Beacon function

`apps/edge/functions/beacon/` implements `POST /v1/beacon`:

- `mod.ts` — pure validation (`validateBeaconRequest`) mirroring the OpenAPI
  `BeaconRequest` schema: `session_token` (non-empty string) and
  `feature_vector` (object).
- `http.ts` — `handleRequest`: parse JSON, validate, then resolve the active
  session by hashing `session_token` (SHA-256) against `sessions.token_hash`
  and checking `expires_at > now()`. On success it inserts one row into
  `beacons` (session, venue, `feature_vector` jsonb); raw field values are
  never stored, only the computed feature vector. No API key is required — the
  caller is identified by the session token alone, matching the OpenAPI
  `security: []` on `/v1/beacon`.
- `index.ts` — the deployed `EdgeHandler`, adapting the Eurobase `ctx` surface.

Run the tests with `make test-edge`.

## Load testing

`apps/edge/loadtest/` is a repeatable harness for the deployed `/v1/evaluate`
function. `run.ts` drives a fixed, documented workload mix (60% residential
browser, 20% datacenter, 20% session-token) at a configurable concurrency, and
records both the client-observed round-trip time and the server-reported
`latency_ms` so client/network latency can be separated from server processing.
Cold start (first request) is reported separately. `stats.ts` holds the pure
percentile/summary functions (unit-tested by `stats_test.ts`).

```bash
make loadtest LOCATION=berlin VENUE_ID=<uuid> VENUE_KEY=sk_test_ven_test_a \
  CONCURRENCY=10 REQUESTS=500
# → writes loadtest-<location>.json + a one-line summary to stdout
```

Results are committed under `apps/edge/loadtest/results/` with the test date,
region/configuration, and workload shape captured in the JSON.

## Demo booking site

`apps/demo-site/` is the corpus/e2e fixture: a static restaurant booking page
(plain HTML/JS/CSS, no framework) plus three public edge functions.

- `functions/session` — `POST /api/session`: mints a 10-minute session token
  for the `ven_demo` venue (stored as a SHA-256 hash in `sessions`).
- `functions/slots` — `GET /api/slots?date=YYYY-MM-DD`: availability for the
  seeded 14-day slot grid. Sold-out slots are `available: false`; a hot slot
  (19:00) only becomes available at its release minute (11:00).
- `functions/book` — `POST /api/book`: validates the session token (unknown →
  400, expired → 410), then books a slot (double-booking → 409).

```bash
make demo-up          # serves the page + proxies /api/* to newtek on :8000
cd apps/demo-site && npm install && npx playwright install chromium
cd apps/demo-site && npm test   # e2e (requires make demo-up running)
```

The `demo_slots` / `demo_bookings` schema is `migrations/0007_demo.sql` (applied
to `newtek`). `apps/demo-site/server.ts` proxies `/api/*` to the deployed
functions so the page never sees the Eurobase project key.

## Labelled corpus (#7)

`ml/corpus/` generates the deterministic, seeded, labelled dataset the ML agent
trains on. One JSONL record per session: `session_id`, `label`
(`human|playwright|browser_use|raw_http|llm_agent`), `generator_version`,
`request`, `events[]` (type, t_ms, field name, optional x/y), `booking`, and
`outcome`. Form field VALUES are never stored — only field names — and the
privacy test injects canary strings to prove it.

Generators: `raw_http` (direct POST, no page), `poller` (400 ms slot polling),
`playwright_fill` (instant `page.fill()`), `playwright_humanlike` (typing jitter
and mouse paths — the hard negative), `browser_use` (optional; skipped in CI with
a `SKIPPED` marker), `human_replay` (replays recorded team sessions — see
`ml/corpus/recorder.py`).

```bash
make corpus            # build corpus_v0.jsonl.gz + manifest.json (seed 1, n=200/synthetic)
cd ml && uv run pytest tests/test_corpus_schema.py tests/test_generators.py
```

Determinism: same `--seed` → byte-identical events. Minimums: ≥200 per synthetic
label; human ≥30 (collection is a manual step via the recorder).

## Beacon library (#8)

`packages/beacon/` is `agien.js` — the behavioural telemetry snippet from PDD
3.2. It observes a booking form and posts a compact feature vector to
`/v1/beacon`. Zero runtime dependencies, built with esbuild to an IIFE
(`dist/agien.iife.js`, global `Agien`) and an ESM build.

```js
const { sessionToken } = Agien.init({
  venueId: "ven_demo",
  endpoint: "https://newtek.eurobase.app/v1/functions/beacon",
  form: document.getElementById("booking-form"),
});
```

Captured features: `t_load_to_first_input`, `t_first_input_to_submit`,
per-field `focus_order` vs DOM order, per-field `dwell_ms`, `keystroke_count`,
`keystroke_interval_std_ms`, `paste_count`, `pointer_event_count`,
`pointer_path_length_px`, `pointer_straightness` (0–1), `scroll_event_count`,
`viewport`, `screen`, `webdriver`, `visibility_changes`.

Privacy by construction: no field values, no key codes, no
canvas/WebGL/audio fingerprinting (enforced by tests). Fails silent — the
beacon never blocks the host form. Test with `npm test` in `packages/beacon`
(23 tests incl. a gzipped-bundle budget of ≤ 8 KB; the IIFE is ~1.5 KB).

## Dashboard (#9)

`apps/dashboard/` is the pilot venue-facing UI (React + Vite + TypeScript, no
component library). Magic-link login, a venue switcher, and a live-updating
evaluations table (time, `p_agent`, `p_phantom`, action, top-3 reason codes).

```bash
cd apps/dashboard && npm install
npm test                 # Vitest + Testing Library (component, hook, axe)
npm run dev              # dev server on :5173 (needs VITE_EUROBASE_* env)
npm run e2e              # Playwright e2e (mock client; auto-starts Vite)
```

Tests: `EvaluationsTable` (2-decimal probabilities, action badges, reason
truncation +n), `useEvaluations` (venue-filtered query + client-side realtime
filter), axe-core (zero serious/critical), and 3 Playwright e2e specs (login →
venue isolation → live insert → axe).

Integration blockers (Sprint 1): there is no user→venue membership table, so
the venue switcher lists all venues the RLS policy permits; the SDK's
`realtime.on()` has no server-side row filter, so inserts are filtered
client-side by `venue_id`; and the e2e uses an in-browser mock client because
real magic-link login needs a seeded auth user + email inbox and JWT→venue_id
RLS wiring, none of which exist yet.

## Feature extraction + reason-code registry (#10)

One definition of the model feature vector, implemented in TypeScript
(`packages/features`, consumed by the Edge Function) and mirrored in Python
(`ml/agien_features`, consumed by training). See `docs/features-v0.md` for the
full key-by-key definition and `docs/reasons-v0.md` for the reason-code
registry.

```bash
make test-features     # Deno: unit tests + golden fixtures
cd ml && uv run pytest tests/test_features_python.py tests/test_parity.py tests/test_reason_registry.py
```

The shared vector is flat (14 scalars): request-source booleans
(`has_accept_language`, `has_referer`, `user_agent_present`,
`is_datacenter_ip` — the CIDR list is one shared JSON file read by both
languages) plus beacon-source features (`t_load_to_first_input_ms`,
`t_first_input_to_submit_ms`, `field_order_match`, keystroke and pointer
counters/timings, `scroll_event_count`). Beacon-only signals the #7 corpus
does not capture (`paste`, `dwell_ms`, `visibility_changes`, viewport/screen/
webdriver) are documented and excluded until the corpus schema is extended.

The parity test runs the TypeScript `extract()` (via `deno run`, subprocess)
and the Python `extract()` over the same golden fixtures
(`packages/features/golden/`) and asserts floats agree to 1e-9 and
ints/bools exactly. The registry test greps `apps/edge` and `packages/beacon`
for reason-code emissions and fails on any code not in `docs/reasons-v0.md`.

## Retention purge

`apps/edge/functions/purge/` is a scheduled job that deletes rows past the
approved retention window: `evaluations` / `outcomes` older than the cutoff
(default 30 days, placeholder pending the Legal retention schedule in #14) and
expired `sessions`. Each table is purged independently; a failure on one is
logged and zeroed rather than crashing the run. The result (cutoff + per-table
counts) is returned for audit.

Run the tests with `make test-edge`. The function is deployed to `newtek`; the
cron schedule is declared once deployed with
`eb.functions.schedules.createOrUpdate("purge", { functionName: "purge",
cron: "0 4 * * *", timezone: "UTC" })` (requires an `eb_sk_*` secret key).

See `CONTRIBUTING.md` for the TDD (red-first) workflow and branch naming.
