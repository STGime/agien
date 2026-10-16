// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { init } from "./index";

describe("resilience", () => {
  it("endpoint 500 does not block the host submit handler", () => {
    document.body.innerHTML = `
      <form id="booking"><input name="name" /><button type="submit">Book</button></form>
    `;
    const form = document.getElementById("booking") as HTMLFormElement;
    let hostRan = false;
    form.addEventListener("submit", () => {
      hostRan = true;
    });
    init({ venueId: "v", endpoint: "https://e.test/beacon", form });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 500 }),
      ) as unknown as typeof fetch;
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(hostRan).toBe(true);
  });

  it("a throwing fetch does not throw out of submit", () => {
    document.body.innerHTML = `
      <form id="booking"><input name="name" /><button type="submit">Book</button></form>
    `;
    const form = document.getElementById("booking") as HTMLFormElement;
    let hostRan = false;
    form.addEventListener("submit", () => {
      hostRan = true;
    });
    init({ venueId: "v", endpoint: "https://e.test/beacon", form });
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    expect(() =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    ).not.toThrow();
    expect(hostRan).toBe(true);
  });

  it("returns a session token synchronously", () => {
    document.body.innerHTML = `<form id="booking"><input name="name" /></form>`;
    const form = document.getElementById("booking") as HTMLFormElement;
    const handle = init({
      venueId: "v",
      endpoint: "https://e.test/beacon",
      form,
    });
    expect(typeof handle.sessionToken).toBe("string");
    expect(handle.sessionToken.length).toBeGreaterThan(0);
  });
});
