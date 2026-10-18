# Feature vector v0

One definition of the model feature vector, implemented in TypeScript
(`packages/features`, used by the Edge Function) and mirrored in Python
(`ml/agien_features`, used for training). Golden fixtures in
`packages/features/golden/` pin the two implementations to identical output.

The vector is **flat** — every key is a scalar (int, float, or bool). It is
produced from two inputs:

| Input | TS `extract(beacon, request)` | Python `extract(record)` |
| --- | --- | --- |
| Beacon payload | `beacon.feature_vector` (computed in-browser by #8) | recomputed from `record.events` |
| Request metadata | `request.headers`, `request.ip` | `record.request.headers`, `record.request.ip` |

`record` is a corpus record from the #7 schema. The Python side first
reproduces the beacon's `feature_vector` from raw events using the same math
as `packages/beacon/src/features.ts`, then both sides apply the identical
flattening below.

The shared vector contains only features **both** sides can compute
identically. Beacon-only signals that the #7 corpus schema does not capture
are listed in [Beacon-only features](#beacon-only-features) and are
deliberately excluded.

## Source: request

Always present, never null. Computed from headers and IP.

| Key | Type | Computation |
| --- | --- | --- |
| `has_accept_language` | bool | `"accept-language" in headers` |
| `has_referer` | bool | `"referer" in headers` |
| `user_agent_present` | bool | `"user-agent" in headers` |
| `is_datacenter_ip` | bool | `ip` matches any CIDR in `packages/features/datacenter-cidrs.json` (shared file, read by both languages) |

## Source: beacon

Every beacon-sourced key is `null` when `beacon_present` is `false` (a
server-only integration with no beacon). Extraction never throws on a missing
beacon.

| Key | Type | Computation / null handling |
| --- | --- | --- |
| `beacon_present` | bool | `feature_vector` is present and non-null |
| `t_load_to_first_input_ms` | number\|null | time from page load to first input event; `null` when no input occurred |
| `t_first_input_to_submit_ms` | number\|null | time from first input to submit; `null` when no input or no submit |
| `field_order_match` | number\|null | 1.0 when focus order equals DOM order, 0.0 when reversed (see below); `null` when no field was focused |
| `keystroke_count` | number\|null | number of `keydown` events (0 is valid) |
| `keystroke_interval_std_ms` | number\|null | sample std-dev (n-1) of intervals between keydowns; `null` when fewer than 2 keystrokes |
| `pointer_event_count` | number\|null | number of pointer-move events (0 is valid) |
| `pointer_path_length_px` | number\|null | sum of Euclidean segment lengths; `null` when no pointer points |
| `pointer_straightness` | number\|null | net displacement / path length, clamped 0–1; `null` when fewer than 2 pointer points |
| `scroll_event_count` | number\|null | number of `scroll` events (0 is valid) |

### `field_order_match`

`focus_order` is the list of field indices in the order they were focused.
DOM order is `[0, 1, …, n-1]`. The score is the normalized sum of absolute
displacements:

```
n = len(focus_order)
if n == 0: return null
s = Σ |focus_order[i] - i|          # over i in 0..n-1
match = clamp01(1 - s / floor(n²/2))
```

- Identical to DOM order → `s = 0` → `1.0`.
- Reversed → `s = floor(n²/2)` → `0.0`.
- Single field (`n = 1`) → `s = 0` → `1.0`.

### Insufficient-data → null

The beacon emits `0`/`1.0` sentinels for empty counters. The shared vector
replaces those with `null` so "no data" is not confused with a real value.
The gating is done by the counter, identically in both languages:

| Key | null when |
| --- | --- |
| `keystroke_interval_std_ms` | `keystroke_count < 2` |
| `pointer_path_length_px` | `pointer_event_count == 0` |
| `pointer_straightness` | `pointer_event_count < 2` |

### Event-type mapping (corpus → beacon)

The #7 corpus uses a different event vocabulary than the in-browser beacon.
The Python side maps them as follows (all other event kinds are ignored for
features):

| Corpus `type` | Beacon equivalent | Consumed by |
| --- | --- | --- |
| `mousemove` (with `x`,`y`) | `pointermove` | pointer features |
| `keydown` | `keydown` | keystroke features, first-input |
| `focus` (with `field`) | `focusin` | `field_order_match`, first-input |
| `fill` | `input` | first-input |
| `submit` | (payload build) | `t_first_input_to_submit_ms` |

## Beacon-only features (not in the shared vector)

The #8 beacon also captures these, but the #7 corpus schema does not, so they
cannot be parity-tested and would be `null` in every training record. They
stay available to the Edge Function via the raw beacon payload but are **not**
part of the model feature vector until a corpus schema revision captures
them:

`paste_count`, `dwell_ms` (mean/std), `visibility_changes`, `viewport_width`,
`viewport_height`, `screen_width`, `screen_height`, `webdriver`.

## Versioning

Any change to a key name, a computation, or the shared CIDR list requires
regenerating the golden fixtures and a parity re-run.
