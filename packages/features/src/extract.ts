import cidrData from "../datacenter-cidrs.json" with { type: "json" };
import { fieldOrderMatch } from "./features.ts";
import { isDatacenterIp } from "./ip.ts";
import type { BeaconPayload, FeatureVector, RequestMeta } from "./types.ts";

const DATACENTER_CIDRS: readonly string[] = cidrData.cidrs as string[];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Produce the flat model feature vector from a beacon payload and request
 * metadata. Pure: no I/O, no runtime imports, no throw on a missing beacon.
 * The Python mirror (ml/agien_features/extract.py) computes identical values.
 */
export function extract(beacon: BeaconPayload, request: RequestMeta): FeatureVector {
  const fv = beacon.feature_vector ?? null;
  const headers = request.headers ?? {};
  const beaconPresent = fv !== null && fv !== undefined;

  const keystrokeCount = beaconPresent ? (num(fv!.keystroke_count) ?? 0) : 0;
  const pointerEventCount = beaconPresent ? (num(fv!.pointer_event_count) ?? 0) : 0;

  return {
    // request source — always present
    has_accept_language: "accept-language" in headers,
    has_referer: "referer" in headers,
    user_agent_present: "user-agent" in headers,
    is_datacenter_ip: isDatacenterIp(request.ip, DATACENTER_CIDRS),

    // beacon source — null when no beacon
    beacon_present: beaconPresent,
    t_load_to_first_input_ms: beaconPresent ? num(fv!.t_load_to_first_input) : null,
    t_first_input_to_submit_ms: beaconPresent ? num(fv!.t_first_input_to_submit) : null,
    field_order_match: beaconPresent
      ? fieldOrderMatch(Array.isArray(fv!.focus_order) ? (fv!.focus_order as number[]) : [])
      : null,
    keystroke_count: beaconPresent ? keystrokeCount : null,
    keystroke_interval_std_ms: beaconPresent && keystrokeCount >= 2
      ? num(fv!.keystroke_interval_std_ms)
      : null,
    pointer_event_count: beaconPresent ? pointerEventCount : null,
    pointer_path_length_px: beaconPresent && pointerEventCount >= 1
      ? num(fv!.pointer_path_length_px)
      : null,
    pointer_straightness: beaconPresent && pointerEventCount >= 2
      ? num(fv!.pointer_straightness)
      : null,
    scroll_event_count: beaconPresent ? num(fv!.scroll_event_count) : null,
  };
}
