import { assertEquals } from "jsr:@std/assert@1";
import { extract } from "./extract.ts";
import {
  fieldOrderMatch,
  intervalStd,
  pointerPathLength,
  pointerStraightness,
  stdDev,
} from "./features.ts";

const richBeacon = {
  feature_vector: {
    t_load_to_first_input: 500,
    t_first_input_to_submit: 1200,
    focus_order: [0, 1, 2],
    keystroke_count: 4,
    keystroke_interval_std_ms: 10.0,
    pointer_event_count: 3,
    pointer_path_length_px: 20.0,
    pointer_straightness: 0.95,
    scroll_event_count: 2,
  },
};

const datacenterRequest = {
  headers: {
    "accept-language": "en",
    referer: "https://venue.example/book",
    "user-agent": "Mozilla/5.0",
  },
  ip: "34.100.50.10",
};

Deno.test("field_order_match: identical order is 1.0, reversed is 0.0", () => {
  assertEquals(fieldOrderMatch([0, 1, 2, 3]), 1.0);
  assertEquals(fieldOrderMatch([3, 2, 1, 0]), 0.0);
  assertEquals(fieldOrderMatch([0]), 1.0);
  assertEquals(fieldOrderMatch([]), null);
});

Deno.test("extract: full beacon + datacenter request, hand-computed values", () => {
  const v = extract(richBeacon, datacenterRequest);
  assertEquals(v.has_accept_language, true);
  assertEquals(v.has_referer, true);
  assertEquals(v.user_agent_present, true);
  assertEquals(v.is_datacenter_ip, true);

  assertEquals(v.beacon_present, true);
  assertEquals(v.t_load_to_first_input_ms, 500);
  assertEquals(v.t_first_input_to_submit_ms, 1200);
  assertEquals(v.field_order_match, 1.0);
  assertEquals(v.keystroke_count, 4);
  assertEquals(v.keystroke_interval_std_ms, 10.0);
  assertEquals(v.pointer_event_count, 3);
  assertEquals(v.pointer_path_length_px, 20.0);
  assertEquals(v.pointer_straightness, 0.95);
  assertEquals(v.scroll_event_count, 2);
});

Deno.test("extract: beacon-less request yields null beacon features and no throw", () => {
  const v = extract({}, { headers: {}, ip: "203.0.113.7" });
  assertEquals(v.beacon_present, false);
  assertEquals(v.has_accept_language, false);
  assertEquals(v.has_referer, false);
  assertEquals(v.user_agent_present, false);
  assertEquals(v.is_datacenter_ip, false);
  for (
    const key of [
      "t_load_to_first_input_ms",
      "t_first_input_to_submit_ms",
      "field_order_match",
      "keystroke_count",
      "keystroke_interval_std_ms",
      "pointer_event_count",
      "pointer_path_length_px",
      "pointer_straightness",
      "scroll_event_count",
    ] as const
  ) {
    assertEquals(v[key], null, key);
  }
});

Deno.test("extract: null beacon feature_vector is treated as absent", () => {
  const v = extract({ feature_vector: null }, datacenterRequest);
  assertEquals(v.beacon_present, false);
  assertEquals(v.keystroke_count, null);
});

Deno.test("extract: keystroke interval gated to null below 2 keystrokes", () => {
  const one = extract(
    { feature_vector: { keystroke_count: 1, keystroke_interval_std_ms: 0 } },
    datacenterRequest,
  );
  assertEquals(one.keystroke_count, 1);
  assertEquals(one.keystroke_interval_std_ms, null);
});

Deno.test("extract: pointer features gated to null with insufficient points", () => {
  const zero = extract({ feature_vector: { pointer_event_count: 0 } }, datacenterRequest);
  assertEquals(zero.pointer_event_count, 0);
  assertEquals(zero.pointer_path_length_px, null);
  assertEquals(zero.pointer_straightness, null);

  const one = extract(
    {
      feature_vector: {
        pointer_event_count: 1,
        pointer_path_length_px: 0,
        pointer_straightness: 1,
      },
    },
    datacenterRequest,
  );
  assertEquals(one.pointer_path_length_px, 0);
  assertEquals(one.pointer_straightness, null);
});

Deno.test("math helpers mirror the beacon's features.ts", () => {
  assertEquals(pointerPathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }]), 5);
  assertEquals(pointerStraightness([{ x: 0, y: 0 }, { x: 3, y: 4 }]), 1.0);
  assertEquals(pointerStraightness([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 0, y: 0 }]), 0.0);
  assertEquals(stdDev([1, 2, 3]), 1.0);
  assertEquals(intervalStd([0, 10, 20, 30]), 0.0);
  assertEquals(stdDev([1]), 0.0);
});
