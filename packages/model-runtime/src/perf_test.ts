import { assert } from "jsr:@std/assert@1";
import { type AgentModel, type FeatureValues, predict } from "./predict.ts";

const model = JSON.parse(
  await Deno.readTextFile(new URL("../../../models/agent_v0.json", import.meta.url)),
) as AgentModel;

// A representative feature vector (browser automation with a beacon).
const features: FeatureValues = {
  has_accept_language: true,
  has_referer: true,
  user_agent_present: true,
  is_datacenter_ip: true,
  beacon_present: true,
  t_load_to_first_input_ms: 500,
  t_first_input_to_submit_ms: 1200,
  field_order_match: 1.0,
  keystroke_count: 4,
  keystroke_interval_std_ms: 10.0,
  pointer_event_count: 3,
  pointer_path_length_px: 10.0,
  pointer_straightness: 1.0,
  scroll_event_count: 0,
};

Deno.test("predict median under 0.2 ms over 10,000 calls", () => {
  for (let i = 0; i < 100; i++) predict(model, features); // warmup
  const times: number[] = [];
  for (let i = 0; i < 10_000; i++) {
    const t0 = performance.now();
    predict(model, features);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  console.log(`predict median: ${(median * 1000).toFixed(2)} us over 10,000 calls`);
  assert(median < 0.2, `median ${median.toFixed(4)} ms >= 0.2 ms`);
});
