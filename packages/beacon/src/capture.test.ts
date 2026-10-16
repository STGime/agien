// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { init } from "./index";

/** A controllable clock for deterministic time-based features. */
function makeClock() {
  const c = { t: 0 };
  return { c, now: () => c.t, advance: (ms: number) => (c.t += ms) };
}

function makeForm(): HTMLFormElement {
  document.body.innerHTML = `
    <form id="booking">
      <input name="name" />
      <input name="email" />
      <input name="phone" />
      <button type="submit">Book</button>
    </form>
  `;
  return document.getElementById("booking") as HTMLFormElement;
}

function pointerMove(x: number, y: number, target: EventTarget = document) {
  target.dispatchEvent(
    new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true }),
  );
}

function keydown(target: EventTarget = document) {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
}

describe("capture", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts keystrokes and paste events", () => {
    const form = makeForm();
    init({ venueId: "v", endpoint: "https://e.test/beacon", form });
    keydown(form);
    keydown(form);
    keydown(form);
    form.dispatchEvent(new Event("paste", { bubbles: true }));
    const payload = submitAndCapture(form);
    expect(payload.feature_vector.keystroke_count).toBe(3);
    expect(payload.feature_vector.paste_count).toBe(1);
  });

  it("computes pointer straightness from pointermove events", () => {
    const form = makeForm();
    init({ venueId: "v", endpoint: "https://e.test/beacon", form });
    // straight line
    for (let x = 0; x <= 40; x += 10) pointerMove(x, 0);
    const payload = submitAndCapture(form);
    expect(payload.feature_vector.pointer_event_count).toBe(5);
    expect(payload.feature_vector.pointer_straightness).toBeGreaterThanOrEqual(
      0.99,
    );
  });

  it("tracks scroll and focus order vs DOM order", () => {
    const form = makeForm();
    const clock = makeClock();
    init({
      venueId: "v",
      endpoint: "https://e.test/beacon",
      form,
      now: clock.now,
    });
    const fields = Array.from(form.querySelectorAll("input"));
    // focus email (index 1) then name (index 0) — out of DOM order
    fields[1].dispatchEvent(new Event("focusin", { bubbles: true }));
    fields[0].dispatchEvent(new Event("focusin", { bubbles: true }));
    form.dispatchEvent(new Event("scroll", { bubbles: true }));
    form.dispatchEvent(new Event("scroll", { bubbles: true }));
    const payload = submitAndCapture(form);
    expect(payload.feature_vector.focus_order).toEqual([1, 0]);
    expect(payload.feature_vector.scroll_event_count).toBe(2);
  });

  it("records per-field dwell time", () => {
    const form = makeForm();
    const clock = makeClock();
    init({
      venueId: "v",
      endpoint: "https://e.test/beacon",
      form,
      now: clock.now,
    });
    const fields = Array.from(form.querySelectorAll("input"));
    clock.advance(1000);
    fields[2].dispatchEvent(new Event("focusin", { bubbles: true }));
    clock.advance(350);
    fields[2].dispatchEvent(new Event("focusout", { bubbles: true }));
    const payload = submitAndCapture(form);
    expect(payload.feature_vector.dwell_ms[2]).toBe(350);
  });

  it("measures load-to-first-input and first-input-to-submit", () => {
    const form = makeForm();
    const clock = makeClock();
    init({
      venueId: "v",
      endpoint: "https://e.test/beacon",
      form,
      now: clock.now,
    });
    clock.advance(500);
    form.dispatchEvent(new Event("input", { bubbles: true }));
    clock.advance(1200);
    const payload = submitAndCapture(form);
    expect(payload.feature_vector.t_load_to_first_input).toBe(500);
    expect(payload.feature_vector.t_first_input_to_submit).toBe(1200);
  });

  it("reports viewport, screen, webdriver, visibility_changes", () => {
    const form = makeForm();
    init({ venueId: "v", endpoint: "https://e.test/beacon", form });
    document.dispatchEvent(new Event("visibilitychange"));
    const payload = submitAndCapture(form);
    const fv = payload.feature_vector;
    expect(fv.viewport).toHaveProperty("width");
    expect(fv.viewport).toHaveProperty("height");
    expect(fv.screen).toHaveProperty("width");
    expect(typeof fv.webdriver).toBe("boolean");
    expect(fv.visibility_changes).toBe(1);
  });
});

/** Submit the form, returning the JSON payload the beacon POSTed. */
function submitAndCapture(form: HTMLFormElement): {
  feature_vector: Record<string, unknown>;
} {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 200 }));
  // re-init with the mock attached is not possible; instead patch global fetch
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  const [url, initArgs] = fetchMock.mock.calls[0];
  expect(String(url)).toBe("https://e.test/beacon");
  return JSON.parse(initArgs.body as string);
}
