SHELL := /bin/bash
DENO  ?= deno
DATABASE_URL ?= postgres://postgres:postgres@localhost:5432/agien

.PHONY: test test-edge test-js test-ml test-db test-contract lint lint-edge lint-js lint-ml lint-contract db-up db-reset loadtest

## Run all test suites; exits non-zero if any one fails.
test:
	@err=0; \
	$(MAKE) test-edge     || err=1; \
	$(MAKE) test-js       || err=1; \
	$(MAKE) test-ml       || err=1; \
	$(MAKE) test-contract || err=1; \
	exit $$err

test-edge:
	cd apps/edge && $(DENO) test --allow-read --allow-net

test-js:
	cd packages/beacon && npm test

test-ml:
	cd ml && uv run pytest -q

test-contract:
	cd packages/contract && npm test

## Lint all runtimes.
lint: lint-edge lint-js lint-ml lint-contract

lint-edge:
	cd apps/edge && $(DENO) fmt --check && $(DENO) lint

lint-js:
	cd packages/beacon && npm run lint

lint-contract:
	cd packages/contract && npm run lint

lint-ml:
	cd ml && uv run ruff check . && uv run ruff format --check .

## Local Postgres + database tests (issue #3).
db-up:
	docker compose up -d postgres

db-reset: db-up
	cd apps/edge && DATABASE_URL=$(DATABASE_URL) $(DENO) run --allow-net --allow-read --allow-env db/reset.ts

test-db:
	cd apps/edge && DATABASE_URL=$(DATABASE_URL) $(DENO) test --allow-net --allow-read --allow-env db/

## Load-test the deployed /v1/evaluate function. Requires EUROBASE_API_KEY (and
## VENUE_API_KEY or --venue-key) + --venue-id. See apps/edge/loadtest/run.ts.
loadtest:
	$(DENO) run --allow-net --allow-env --allow-write apps/edge/loadtest/run.ts \
		--location $(or $(LOCATION),unknown) --venue-id $(VENUE_ID) \
		--venue-key $(VENUE_KEY) --concurrency $(or $(CONCURRENCY),10) \
		--requests $(or $(REQUESTS),500)
