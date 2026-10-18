/** Shared input/output types for the feature extraction library. */

/** Flat model feature vector — one scalar per key. See docs/features-v0.md. */
export interface FeatureVector {
  // request source
  has_accept_language: boolean;
  has_referer: boolean;
  user_agent_present: boolean;
  is_datacenter_ip: boolean;

  // beacon source
  beacon_present: boolean;
  t_load_to_first_input_ms: number | null;
  t_first_input_to_submit_ms: number | null;
  field_order_match: number | null;
  keystroke_count: number | null;
  keystroke_interval_std_ms: number | null;
  pointer_event_count: number | null;
  pointer_path_length_px: number | null;
  pointer_straightness: number | null;
  scroll_event_count: number | null;
}

/** Request metadata available to the Edge Function. */
export interface RequestMeta {
  headers: Record<string, string>;
  ip: string;
}

/**
 * The beacon's computed feature vector (as produced in-browser by
 * packages/beacon and posted to /v1/beacon). Only the fields the extraction
 * layer consumes are typed; the rest is passed through unchanged.
 */
export interface BeaconFeatureVector {
  t_load_to_first_input?: number | null;
  t_first_input_to_submit?: number | null;
  focus_order?: number[];
  keystroke_count?: number;
  keystroke_interval_std_ms?: number;
  pointer_event_count?: number;
  pointer_path_length_px?: number;
  pointer_straightness?: number;
  scroll_event_count?: number;
  [key: string]: unknown;
}

export interface BeaconPayload {
  feature_vector?: BeaconFeatureVector | null;
}
