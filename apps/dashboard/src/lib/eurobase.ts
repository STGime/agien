import { createClient, type EurobaseClient } from "@eurobase/sdk";

declare global {
  interface Window {
    __EUROBASE_CLIENT__?: EurobaseClient;
  }
}

/**
 * The dashboard talks to Eurobase through the JS SDK. The client is created
 * once from env vars (Vite exposes VITE_* to the browser).
 *
 * Overrides, in priority order:
 *   1. `window.__EUROBASE_CLIENT__` — set by the e2e harness with a fake client.
 *   2. `setEurobaseClient()` — used by unit tests.
 */
let clientOverride: EurobaseClient | null = null;

export function setEurobaseClient(client: EurobaseClient | null): void {
  clientOverride = client;
}

export function getEurobaseClient(): EurobaseClient {
  if (typeof window !== "undefined" && window.__EUROBASE_CLIENT__) {
    return window.__EUROBASE_CLIENT__;
  }
  if (clientOverride) return clientOverride;
  const url = import.meta.env.VITE_EUROBASE_URL ?? "https://newtek.eurobase.app";
  const apiKey = import.meta.env.VITE_EUROBASE_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_EUROBASE_API_KEY is not set");
  }
  return createClient({ url, apiKey, projectId: import.meta.env.VITE_EUROBASE_PROJECT_ID });
}
