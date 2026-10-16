/** Core of the /api/slots demo function — pure, no runtime imports. */

export interface DemoSlotRow {
  id: string;
  slot_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  sold_out: boolean;
  is_hot: boolean;
  hot_release_minute: number | null; // minute-of-day, null unless is_hot
  booked: boolean; // derived from demo_bookings
}

export interface SlotAvailability {
  id: string;
  start_time: string;
  available: boolean;
  is_hot: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DateValidation = { ok: true; value: string } | { ok: false; message: string };

export function validateDateParam(raw: string | null): DateValidation {
  if (!raw || raw.trim() === "") {
    return { ok: false, message: "date query parameter is required (YYYY-MM-DD)" };
  }
  const value = raw.trim();
  if (!DATE_RE.test(value)) {
    return { ok: false, message: "date must be YYYY-MM-DD" };
  }
  return { ok: true, value };
}

/**
 * A slot is bookable when it is not sold out, not already booked, and — if
 * it is a hot slot — only at/after its release minute on its own date.
 */
export function slotAvailable(slot: DemoSlotRow, now: Date): boolean {
  if (slot.sold_out || slot.booked) return false;
  if (!slot.is_hot) return true;
  const minute = slot.hot_release_minute;
  if (minute === null) return true;
  const release = new Date(`${slot.slot_date}T00:00:00Z`);
  release.setUTCMinutes(minute);
  return now.getTime() >= release.getTime();
}

export function toAvailability(slot: DemoSlotRow, now: Date): SlotAvailability {
  return {
    id: slot.id,
    start_time: slot.start_time.slice(0, 5),
    available: slotAvailable(slot, now),
    is_hot: slot.is_hot,
  };
}
