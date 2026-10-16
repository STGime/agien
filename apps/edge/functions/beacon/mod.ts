/** Core of the /v1/beacon Edge Function — pure validation, no runtime imports. */

/** Mirrors docs/openapi/agien-v0.yaml#/components/schemas/BeaconRequest. */
export interface BeaconRequest {
  session_token: string;
  feature_vector: Record<string, unknown>;
}

export type Validation =
  | { ok: true; value: BeaconRequest }
  | { ok: false; message: string };

export function validateBeaconRequest(body: unknown): Validation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.session_token !== "string" || b.session_token.trim() === "") {
    return { ok: false, message: "session_token must be a non-empty string" };
  }
  if (typeof b.feature_vector !== "object" || b.feature_vector === null) {
    return { ok: false, message: "feature_vector must be an object" };
  }
  return {
    ok: true,
    value: {
      session_token: b.session_token,
      feature_vector: b.feature_vector as Record<string, unknown>,
    },
  };
}
