import { defineConfig } from "@playwright/test";

/**
 * e2e for the demo booking site. The local proxy server (make demo-up) must be
 * running; it forwards /api/* to the deployed newtek functions, so the test
 * exercises the real Eurobase backend. Requires EUROBASE_API_KEY in the env.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.DEMO_URL ?? "http://localhost:8000",
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
});
