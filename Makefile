SHELL := /bin/bash
DENO  ?= deno

.PHONY: test test-edge test-js test-ml test-contract lint lint-edge lint-js lint-ml lint-contract

## Run all test suites; exits non-zero if any one fails.
test:
	@err=0; \
	$(MAKE) test-edge     || err=1; \
	$(MAKE) test-js       || err=1; \
	$(MAKE) test-ml       || err=1; \
	$(MAKE) test-contract || err=1; \
	exit $$err

test-edge:
	cd apps/edge && $(DENO) test

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
