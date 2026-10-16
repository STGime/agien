import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Dashboard e2e against a mock Eurobase client injected into the page (see
 * mock-client.ts). This exercises the real UI — login, venue switching,
 * evaluations table, live insert, RLS-style venue isolation — without a real
 * Eurobase Auth magic-link email or live Realtime socket. Those integrations
 * are documented as a blocker in README (#9 note).
 */

const MOCK = `
window.__EUROBASE_CLIENT__ = (() => {
  const VENUES = [
    { id: "venue-a", slug: "ven_test_a", name: "Venue Test A", created_at: "2026-10-01T00:00:00Z" },
    { id: "venue-b", slug: "ven_test_b", name: "Venue Test B", created_at: "2026-10-01T00:00:00Z" },
  ];
  const EVALS = [
    { id: "eval-a-1", venue_id: "venue-a", created_at: "2026-10-16T12:00:00Z", p_agent: 0.1234, p_phantom: 0.34, action: "allow", reasons: [{ code: "no_beacon_session", weight: 0.3 }], policy_version: "v0" },
    { id: "eval-a-2", venue_id: "venue-a", created_at: "2026-10-16T11:00:00Z", p_agent: 0.8555, p_phantom: 0.9, action: "deny", reasons: [{ code: "verified_declared_identity", weight: 0.95 }], policy_version: "v0" },
    { id: "eval-b-1", venue_id: "venue-b", created_at: "2026-10-16T12:30:00Z", p_agent: 0.5, p_phantom: 0.6, action: "step_up", reasons: [{ code: "datacenter_asn", weight: 0.4 }], policy_version: "v0" },
  ];
  const rows = [...EVALS];
  const subs = new Set();
  function builder() {
    let venueId = null;
    return {
      select: function(){ return this; },
      eq: function(c, v){ if (c === "venue_id") venueId = v; return this; },
      order: function(){ return this; },
      limit: function(){ return this; },
      then: function(resolve){
        if (venueId === null) resolve({ data: VENUES, error: null });
        else resolve({ data: rows.filter(r => r.venue_id === venueId), error: null });
      },
    };
  }
  return {
    auth: {
      requestMagicLink: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
      getSession: () => null,
    },
    db: { from: () => builder() },
    realtime: {
      on: (_t, _e, cb) => { subs.add(cb); return { id: "s" }; },
      off: () => {},
    },
    _push: (r) => { rows.push(r); subs.forEach(cb => cb({ record: r })); },
    functions: {},
    storage: {},
    vault: {},
    status: async () => ({ ok: true, latency_ms: 1 }),
  };
})();
`;

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("pilot@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
}

test("login, select venue A, see only venue A's evaluations", async ({ page }) => {
  await page.addInitScript(MOCK);
  await login(page);

  // venues load; pick Venue Test A
  await page.getByRole("button", { name: "Venue Test A" }).click();

  // venue A rows visible with 2-decimal probabilities
  await expect(page.getByText("no_beacon_session")).toBeVisible();
  await expect(page.getByText("0.12")).toBeVisible();
  await expect(page.getByText("0.86")).toBeVisible();

  // venue B's evaluation id must not appear anywhere
  await expect(page.getByText("datacenter_asn")).toHaveCount(0);
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("eval-b-1");
});

test("new evaluation for venue A appears within 2 s without reload", async ({ page }) => {
  await page.addInitScript(MOCK);
  await login(page);
  await page.getByRole("button", { name: "Venue Test A" }).click();
  await expect(page.getByText("no_beacon_session")).toBeVisible();

  // simulate a live INSERT on venue A (a venue B insert must be ignored)
  await page.evaluate(() => {
    const client = (window as unknown as { __EUROBASE_CLIENT__: { _push: (r: unknown) => void } })
      .__EUROBASE_CLIENT__;
    // push venue B first (should be dropped), then venue A
    client._push({ id: "eval-b-2", venue_id: "venue-b", created_at: "2026-10-16T13:00:00Z", p_agent: 0.1, p_phantom: 0.1, action: "allow", reasons: [{ code: "x", weight: 0.1 }], policy_version: "v0" });
    client._push({ id: "eval-a-3", venue_id: "venue-a", created_at: "2026-10-16T13:01:00Z", p_agent: 0.99, p_phantom: 0.98, action: "deny", reasons: [{ code: "live_insert_marker", weight: 0.95 }], policy_version: "v0" });
  });

  await expect(page.getByText("live_insert_marker")).toBeVisible({ timeout: 2000 });
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("eval-b-2");
});

test("axe reports zero serious or critical violations", async ({ page }) => {
  await page.addInitScript(MOCK);
  await login(page);
  await page.getByRole("button", { name: "Venue Test A" }).click();
  await expect(page.getByText("no_beacon_session")).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
});
