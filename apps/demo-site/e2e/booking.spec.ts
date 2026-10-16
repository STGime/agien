import { expect, test } from "@playwright/test";

/**
 * Human-style booking flow against the local demo proxy (which forwards to the
 * deployed newtek functions). Scripts a real interaction: page load mints a
 * session token, the user picks a date/slot, fills the form with typing
 * delays, submits, and the booking lands in demo_bookings keyed to the same
 * session token.
 */
test("a human-style flow completes a booking", async ({ page }) => {
  // --- page load mints a session token ---
  const sessionPromise = page.waitForResponse(
    (r) => r.url().includes("/api/session") && r.request().method() === "POST",
  );
  await page.goto("/");
  const sessionResp = await sessionPromise;
  expect(sessionResp.status()).toBe(200);
  const { session_token } = await sessionResp.json();
  expect(session_token).toBeTruthy();

  // --- wait for slots to render ---
  const slotLabel = page.locator('.slot:not(.disabled) input[type="radio"]').first();
  await expect(slotLabel).toBeVisible({ timeout: 15_000 });

  // human-like: scroll, then click the first available slot
  await page.mouse.wheel(0, 200);
  await slotLabel.click();

  // --- fill the form with realistic delays ---
  await page.getByLabel("Name").click();
  await page.keyboard.type("Ada Lovelace", { delay: 30 });
  await page.getByLabel("Email").click();
  await page.keyboard.type("ada@example.com", { delay: 25 });
  await page.getByLabel("Phone").click();
  await page.keyboard.type("+49 30 123456", { delay: 25 });
  await page.getByLabel("Notes").click();
  await page.keyboard.type("Window seat please", { delay: 20 });

  // capture the book request to assert the same session token is echoed
  const bookPromise = page.waitForResponse(
    (r) => r.url().includes("/api/book") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Book table" }).click();
  const bookResp = await bookPromise;

  expect(bookResp.status()).toBe(200);
  const bookBody = bookResp.request().postDataJSON();
  expect(bookBody.session_token).toBe(session_token);

  // --- confirmation shown ---
  await expect(page.getByRole("status")).toHaveText(/Booked!/, { timeout: 15_000 });
});

test("the page is keyboard-operable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("radiogroup")).toBeVisible({ timeout: 15_000 });
  // focus the date field via keyboard and confirm it accepts focus
  await page.keyboard.press("Tab");
  await expect(page.locator("#date")).toBeFocused();
});
