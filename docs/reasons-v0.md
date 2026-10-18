# Reason-code registry v0

Canonical list of every reason code a decision can carry. A reason code is a
stable, human-readable identifier explaining *why* a score/action was chosen;
it travels in `EvaluateResponse.reasons[].code` and in `VerifyResult.reason_codes`.

Codes are namespaced by the layer that emits them:

| Layer | Meaning |
| --- | --- |
| `identity` | Declared-identity verification (publisher IP lists, Web Bot Auth) |
| `request` | Request-shape heuristics (headers, network origin) |
| `beacon` | Beacon presence / absence |
| `system` | Internal fail-safe |

`default_weight` is the additive contribution used by the v0 rules engine
(`apps/edge/functions/evaluate/mod.ts`). Identity-layer codes with no
`default_weight` are verification *outcomes*, not score signals — they inform
the identity floor rather than adding weight directly.

## Registry

| code | layer | default_weight | description |
| --- | --- | --- | --- |
| `verified_declared_identity` | identity | 0.95 | A declared agent identity verified (Web Bot Auth signature or publisher IP match) |
| `ua_publisher_ip_mismatch` | identity | 0.90 | Declared publisher User-Agent, but request IP not in the publisher's published ranges |
| `ua_publisher_ip_verified` | identity | — | Declared publisher User-Agent with request IP inside the publisher's ranges |
| `no_declared_identity` | identity | — | No declared agent identity present |
| `web_bot_auth_verified` | identity | — | RFC 9421 Web Bot Auth signature verified |
| `web_bot_auth_invalid` | identity | — | Web Bot Auth signature malformed, missing key, or failed verification |
| `web_bot_auth_expired` | identity | — | Web Bot Auth signature past its `expires` timestamp |
| `datacenter_asn` | request | 0.40 | Request IP within a known datacenter/cloud CIDR range |
| `missing_accept_language` | request | 0.10 | Request has no `accept-language` header |
| `missing_referer` | request | 0.10 | Request has no `referer` header |
| `no_beacon_session` | beacon | 0.30 | No beacon telemetry received for the session token |
| `agien_internal_error` | system | 1.00 | Unexpected internal error; fail-safe (action `allow`, p=0) |

## Not reason codes

These look similar but live in a different namespace and are **not** in this
registry:

- **Actions** (`allow`, `step_up`, `deny`) — the decision, not the rationale.
- **Error envelope codes** (`invalid_request`, `invalid_json`,
  `missing_api_key`, `invalid_api_key`, `venue_mismatch`, `internal_error`,
  `unknown_session_token`, `slot_taken`, …) — HTTP error responses, not
  decision reasons.
- **Cancellation policies** (`card_hold`, `none`, `free`) — booking metadata.
- **Identity methods** (`ip_list`, `web_bot_auth`) — the *mechanism* used, not
  the outcome.

## Enforcement

`ml/tests/test_reason_registry.py` greps `apps/edge` and `packages/beacon` for
reason-code emissions (`code: "…"`, `reason_code: "…"`, `fail("…")`, and
`reason_codes: […]`) and fails if any extracted code is missing from this
registry. Add new codes here *before* referencing them in code.
