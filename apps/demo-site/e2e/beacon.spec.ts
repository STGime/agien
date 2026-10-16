import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const beaconRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/beacon");

/** Build the beacon IIFE and return its source for injection into the page. */
function buildBeaconIife(): string {
  execSync("npm run build", { cwd: beaconRoot, stdio: "pipe" });
  return readFileSync(resolve(beaconRoot, "dist/agien.iife.js"), "utf8");
}

const BEACON_URL = "https://beacon.invalid/ingest";

/** Route-intercept the beacon POST and return the captured feature vector. */
async function captureBeacon(page: import("@playwright/test").Page) {
  let captured: Record<string, unknown> | null = null;
  await page.route(BEACON_URL, (route) => {
    captured = route.request().postDataJSON();
    route.fulfill({ status: 200, body: JSON.stringify({ accepted: true }) });
  });
  return () => captured;
}

test("human-style flow captures pointer + keystroke events", async ({ page }) => {
  const iife = buildBeaconIife();
  await page.goto("/");
  await expect(page.locator('.slot:not(.disabled) input[type="radio"]').first()).toBeVisible({
    timeout: 15_000,
  });

  await page.addScriptTag({ content: iife });
  await page.evaluate((url) => {
    const form = document.getElementById("booking-form");
    (window as unknown as { Agien: { init: (o: unknown) => unknown } }).Agien.init({
      venueId: "ven_demo",
      endpoint: url,
      form,
    });
  }, BEACON_URL);
  const getCaptured = await captureBeacon(page);

  // human-like: move the mouse, click, type with delays
  await page.mouse.move(200, 200);
  await page.mouse.move(320, 260, { steps: 5 });
  await page.locator('.slot:not(.disabled) input[type="radio"]').first().click();
  await page.getByLabel("Name").click();
  await page.keyboard.type("Ada Lovelace", { delay: 30 });
  await page.getByLabel("Email").click();
  await page.keyboard.type("ada@example.com", { delay: 25 });

  // also stub the real booking POST so this test doesn't write a demo booking
  await page.route("**/api/book", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ booked: true }) }),
  );
  await page.getByRole("button", { name: "Book table" }).click();

  const payload = getCaptured();
  expect(payload).not.toBeNull();
  const fv = (payload as { feature_vector: Record<string, number> }).feature_vector;
  expect(fv.pointer_event_count).toBeGreaterThan(0);
  expect(fv.keystroke_count).toBeGreaterThan(0);
});

test("page.fill() flow captures zero pointer and zero keystrokes", async ({ page }) => {
  const iife = buildBeaconIife();
  await page.goto("/");
  await expect(page.locator('.slot:not(.disabled) input[type="radio"]').first()).toBeVisible({
    timeout: 15_000,
  });

  await page.addScriptTag({ content: iife });
  await page.evaluate((url) => {
    const form = document.getElementById("booking-form");
    (window as unknown as { Agien: { init: (o: unknown) => unknown } }).Agien.init({
      venueId: "ven_demo",
      endpoint: url,
      form,
    });
  }, BEACON_URL);
  const getCaptured = await captureBeacon(page);

  // page.fill() — instant value injection, no mouse, no keystrokes
  await page.getByLabel("Name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");

  await page.route("**/api/book", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ booked: true }) }),
  );
  // select the slot and submit without any pointer/keystroke events
  await page.evaluate(() => {
    const radio = document.querySelector('.slot:not(.disabled) input[type="radio"]');
    if (radio instanceof HTMLInputElement) radio.checked = true;
    (document.getElementById("booking-form") as HTMLFormElement).requestSubmit();
  });

  const payload = getCaptured();
  expect(payload).not.toBeNull();
  const fv = (payload as { feature_vector: Record<string, number> }).feature_vector;
  expect(fv.pointer_event_count).toBe(0);
  expect(fv.keystroke_count).toBe(0);
});
