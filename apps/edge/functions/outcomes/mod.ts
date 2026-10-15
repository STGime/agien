/** Core of the /v1/outcomes Edge Function — pure validation, no runtime imports. */

export type OutcomeStatus = "seated" | "no_show" | "cancelled" | "forfeited";

/** Mirrors docs/openapi/agien-v0.yaml#/components/schemas/OutcomeRequest. */
export interface OutcomeRequest {
  evaluation_id: string;
  status: OutcomeStatus;
  reported_at?: string;
}

export type Validation =
  | { ok: true; value: OutcomeRequest }
  | { ok: false; message: string };

const STATUSES: readonly OutcomeStatus[] = ["seated", "no_show", "cancelled", "forfeited"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateOutcomeRequest(body: unknown): Validation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.evaluation_id !== "string" || !UUID_RE.test(b.evaluation_id)) {
    return { ok: false, message: "evaluation_id must be a UUID string" };
  }
  if (typeof b.status !== "string" || !STATUSES.includes(b.status as OutcomeStatus)) {
    return { ok: false, message: `status must be one of ${STATUSES.join(", ")}` };
  }
  if (b.reported_at !== undefined && typeof b.reported_at !== "string") {
    return { ok: false, message: "reported_at must be an ISO-8601 string" };
  }
  return {
    ok: true,
    value: {
      evaluation_id: b.evaluation_id,
      status: b.status as OutcomeStatus,
      reported_at: typeof b.reported_at === "string" ? b.reported_at : undefined,
    },
  };
}
