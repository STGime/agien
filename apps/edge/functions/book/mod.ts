/** Core of the /api/book demo function — pure validation, no runtime imports. */

export interface BookRequest {
  session_token: string;
  slot_id: string;
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  party_size: number;
}

export type Validation = { ok: true; value: BookRequest } | { ok: false; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateBookRequest(body: unknown): Validation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.session_token !== "string" || b.session_token.trim() === "") {
    return { ok: false, message: "session_token must be a non-empty string" };
  }
  if (typeof b.slot_id !== "string" || !UUID_RE.test(b.slot_id)) {
    return { ok: false, message: "slot_id must be a UUID string" };
  }
  if (typeof b.name !== "string" || b.name.trim() === "") {
    return { ok: false, message: "name must be a non-empty string" };
  }
  if (typeof b.email !== "string" || b.email.trim() === "") {
    return { ok: false, message: "email must be a non-empty string" };
  }
  if (typeof b.party_size !== "number" || !Number.isInteger(b.party_size) || b.party_size < 1) {
    return { ok: false, message: "party_size must be a positive integer" };
  }
  if (b.phone !== undefined && typeof b.phone !== "string") {
    return { ok: false, message: "phone must be a string" };
  }
  if (b.notes !== undefined && typeof b.notes !== "string") {
    return { ok: false, message: "notes must be a string" };
  }

  return {
    ok: true,
    value: {
      session_token: b.session_token,
      slot_id: b.slot_id,
      name: b.name,
      email: b.email,
      phone: b.phone as string | undefined,
      notes: b.notes as string | undefined,
      party_size: b.party_size,
    },
  };
}
