// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import { load } from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import { init } from "./index";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const specPath = resolve(repoRoot, "docs/openapi/agien-v0.yaml");

function beaconRequestSchema(): unknown {
  const spec = load(readFileSync(specPath, "utf8")) as {
    components: { schemas: { BeaconRequest: unknown } };
  };
  return spec.components.schemas.BeaconRequest;
}

describe("contract", () => {
  it("payload validates against the OpenAPI BeaconRequest schema", () => {
    document.body.innerHTML = `
      <form id="booking"><input name="name" /><button type="submit">Book</button></form>
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
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const ok = ajv.validate(beaconRequestSchema(), payload);
    if (!ok) {
      throw new Error(
        `payload failed BeaconRequest schema: ${JSON.stringify(ajv.errors)}`,
      );
    }
    expect(payload.session_token).toBeTruthy();
    expect(typeof payload.feature_vector).toBe("object");
  });
});
