import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = resolve(pkgRoot, "../../docs/openapi/agien-v0.yaml");
const redoclyBin = resolve(pkgRoot, "node_modules/.bin/redocly");

function loadSpec(): Record<string, unknown> {
  return load(readFileSync(specPath, "utf8")) as Record<string, unknown>;
}

describe("agien-v0.yaml", () => {
  it("parses as YAML and declares OpenAPI 3.1.0", () => {
    const spec = loadSpec();
    expect(spec.openapi).toBe("3.1.0");
  });

  it("lints clean with zero errors or warnings against the OpenAPI 3.1 ruleset", () => {
    const out = execFileSync(
      redoclyBin,
      ["lint", specPath, "--format=json"],
      { encoding: "utf8", cwd: pkgRoot },
    );
    const problems = JSON.parse(out) as Array<{ severity: string }>;
    expect(problems).toEqual([]);
  });

  it("constrains EvaluateResponse.action to exactly [allow, step_up, deny]", () => {
    const spec = loadSpec();
    const schemas = (spec.components as { schemas: Record<string, any> }).schemas;
    const action = schemas.EvaluateResponse.properties.action;
    expect(action.type).toBe("string");
    expect(action.enum).toEqual(["allow", "step_up", "deny"]);
  });

  it("constrains p_agent and p_phantom to numbers in [0, 1]", () => {
    const spec = loadSpec();
    const schemas = (spec.components as { schemas: Record<string, any> }).schemas;
    for (const field of ["p_agent", "p_phantom"] as const) {
      const p = schemas.EvaluateResponse.properties[field];
      expect(p.type).toBe("number");
      expect(p.minimum).toBe(0);
      expect(p.maximum).toBe(1);
    }
  });
});
