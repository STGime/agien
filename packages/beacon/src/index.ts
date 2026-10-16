/**
 * agien.js — behavioural telemetry beacon. Observes a booking form and posts a
 * compact feature vector to /v1/beacon. Privacy by construction: no field
 * values, no key codes, no canvas/WebGL/audio fingerprinting.
 */

import {
  intervalStd,
  type Point,
  pointerPathLength,
  pointerStraightness,
} from "./features";

export interface AgienOptions {
  venueId: string;
  endpoint: string;
  form: HTMLFormElement | string;
  /** Optional: an existing server-minted session token (e.g. from /api/session). */
  sessionToken?: string;
  /** Injectable clock (tests). Defaults to a high-resolution monotonic-ish clock. */
  now?: () => number;
}

export interface AgienHandle {
  sessionToken: string;
}

interface Field {
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  index: number;
  dwellMs: number;
  focusStart: number | null;
}

function resolveForm(form: HTMLFormElement | string): HTMLFormElement | null {
  if (typeof form === "string") {
    return document.querySelector(form) as HTMLFormElement | null;
  }
  return form;
}

function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function randomToken(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID().replace(/-/g, "");
  }
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}

export function init(options: AgienOptions): AgienHandle {
  const form = resolveForm(options.form);
  if (!form) {
    throw new Error("agien: form element not found");
  }
  const now = options.now ?? defaultNow;
  const sessionToken = options.sessionToken ?? randomToken();

  const fieldElements = Array.from(
    form.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea"),
  );
  const byElement = new Map<Element, Field>();
  fieldElements.forEach((element, index) => {
    byElement.set(element, { element, index, dwellMs: 0, focusStart: null });
  });

  const loadAt = now();
  let firstInputAt: number | null = null;
  const focusOrder: number[] = [];
  const keystrokeTimes: number[] = [];
  let pasteCount = 0;
  const pointerPath: Point[] = [];
  let pointerEventCount = 0;
  let scrollCount = 0;
  let visibilityChanges = 0;
  let sent = false;

  function markFirstInput(): void {
    if (firstInputAt === null) firstInputAt = now();
  }

  function onKeydown(): void {
    markFirstInput();
    keystrokeTimes.push(now());
  }
  function onInput(): void {
    markFirstInput();
  }
  function onPaste(): void {
    markFirstInput();
    pasteCount++;
  }
  function onPointerMove(e: MouseEvent): void {
    markFirstInput();
    pointerEventCount++;
    pointerPath.push({ x: e.clientX, y: e.clientY });
  }
  function onScroll(): void {
    scrollCount++;
  }
  function onFocusIn(e: FocusEvent): void {
    markFirstInput();
    const field = byElement.get(e.target as Element);
    if (!field) return;
    focusOrder.push(field.index);
    field.focusStart = now();
  }
  function onFocusOut(e: FocusEvent): void {
    const field = byElement.get(e.target as Element);
    if (!field || field.focusStart === null) return;
    field.dwellMs += now() - field.focusStart;
    field.focusStart = null;
  }
  function onVisibilityChange(): void {
    visibilityChanges++;
  }

  form.addEventListener("keydown", onKeydown, { capture: true, passive: true });
  form.addEventListener("input", onInput, { capture: true, passive: true });
  form.addEventListener("paste", onPaste, { capture: true, passive: true });
  form.addEventListener("scroll", onScroll, { capture: true, passive: true });
  form.addEventListener("focusin", onFocusIn, { capture: true });
  form.addEventListener("focusout", onFocusOut, { capture: true });
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  function buildFeatureVector(): Record<string, unknown> {
    const dwell = fieldElements.map((el) => byElement.get(el)?.dwellMs ?? 0);
    return {
      venue_id: options.venueId,
      t_load_to_first_input:
        firstInputAt === null ? null : firstInputAt - loadAt,
      t_first_input_to_submit:
        firstInputAt === null ? null : now() - firstInputAt,
      focus_order: focusOrder,
      dwell_ms: dwell,
      keystroke_count: keystrokeTimes.length,
      keystroke_interval_std_ms: intervalStd(keystrokeTimes),
      paste_count: pasteCount,
      pointer_event_count: pointerEventCount,
      pointer_path_length_px: pointerPathLength(pointerPath),
      pointer_straightness: pointerStraightness(pointerPath),
      scroll_event_count: scrollCount,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      screen: { width: window.screen.width, height: window.screen.height },
      webdriver: navigator.webdriver === true,
      visibility_changes: visibilityChanges,
    };
  }

  function post(payload: {
    session_token: string;
    feature_vector: Record<string, unknown>;
  }): void {
    if (sent) return;
    sent = true;
    try {
      // fire-and-forget; never let the beacon block the host form
      fetch(options.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        /* fail silent */
      });
    } catch {
      /* fail silent */
    }
  }

  function makePayload(): {
    session_token: string;
    feature_vector: Record<string, unknown>;
  } {
    return {
      session_token: sessionToken,
      feature_vector: buildFeatureVector(),
    };
  }

  form.addEventListener("submit", () => {
    post(makePayload());
  });

  window.addEventListener("pagehide", () => {
    if (sent) return;
    const payload = makePayload();
    if (typeof navigator.sendBeacon === "function") {
      try {
        navigator.sendBeacon(
          options.endpoint,
          new Blob([JSON.stringify(payload)], { type: "application/json" }),
        );
        sent = true;
      } catch {
        /* fail silent */
      }
    }
  });

  return { sessionToken };
}
