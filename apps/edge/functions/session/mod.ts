/** Core of the /api/session demo function — pure, no runtime imports. */

export type SessionRequest = Record<string, never>;

export type Validation = { ok: true; value: SessionRequest } | { ok: false; message: string };

export function validateSessionRequest(_body: unknown): Validation {
  return { ok: true, value: {} };
}
