// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { init } from "./index";

const srcDir = dirname(fileURLToPath(import.meta.url));

describe("privacy", () => {
  it("does not serialize form field values", () => {
    document.body.innerHTML = `
      <form id="booking">
        <input name="name" value="CANARY_NAME_7f3" />
        <input name="email" value="CANARY_EMAIL_7f3@example.com" />
        <input name="phone" value="CANARY_PHONE_7f3" />
        <textarea name="notes">CANARY_NOTES_7f3</textarea>
        <button type="submit">Book</button>
      </form>
    `;
    const form = document.getElementById("booking") as HTMLFormElement;
    init({ venueId: "v", endpoint: "https://e.test/beacon", form });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    const body = fetchMock.mock.calls[0][1].body as string;
    const canaries = [
      "CANARY_NAME_7f3",
      "CANARY_EMAIL_7f3",
      "CANARY_PHONE_7f3",
      "CANARY_NOTES_7f3",
    ];
    for (const c of canaries) {
      expect(body.includes(c)).toBe(false);
    }
    // no property literally named `value` anywhere in the payload
    expect(body.includes('"value"')).toBe(false);
  });

  it("source never references fingerprinting APIs", () => {
    const forbidden = [
      "toDataURL",
      "getContext('webgl')",
      "AudioContext",
      "KeyboardEvent.key",
    ];
    const files = readdirSync(srcDir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(resolve(srcDir, f), "utf8");
      for (const token of forbidden) {
        expect(src.includes(token), `${f} references ${token}`).toBe(false);
      }
    }
  });
});
