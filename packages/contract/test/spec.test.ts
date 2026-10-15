import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = resolve(pkgRoot, "../../docs/openapi/agien-v0.yaml");
const redoclyBin = resolve(pkgRoot, "node_modules/.bin/redocly");

type Json = unknown;
type SchemaMap = Record<string, Json>;

function loadSpec(): Record<string, Json> {
  return load(readFileSync(specPath, "utf8")) as Record<string, Json>;
}

function schemas(): SchemaMap {
  const spec = loadSpec();
  const components = spec.components as { schemas?: SchemaMap };
  if (!components.schemas) {
    throw new Error("spec is missing components.schemas");
  }
  return components.schemas;
}

interface EvaluateResponseShape {
  properties: Record<
    string,
    { type?: string; enum?: string[]; minimum?: number; maximum?: number }
  >;
}

function evaluateResponse(): EvaluateResponseShape {
  return schemas().EvaluateResponse as EvaluateResponseShape;
}

describe("agien-v0.yaml", () => {
  it("parses as YAML and declares OpenAPI 3.1.0", () => {
    expect(loadSpec().openapi).toBe("3.1.0");
  });

  it("lints clean with zero errors or warnings against the OpenAPI 3.1 ruleset", () => {
    const out = execFileSync(redoclyBin, ["lint", specPath, "--format=json"], {
      encoding: "utf8",
      cwd: pkgRoot,
      env: { ...process.env, REDOCLY_TELEMETRY: "off" },
    });
    const result = JSON.parse(out) as {
      totals: { errors: number; warnings: number };
      problems: Array<{ severity: string }>;
    };
    expect(result.totals.errors).toBe(0);
    expect(result.totals.warnings).toBe(0);
    expect(result.problems).toEqual([]);
  });

  it("constrains EvaluateResponse.action to exactly [allow, step_up, deny]", () => {
    const action = evaluateResponse().properties.action;
    expect(action.type).toBe("string");
    expect(action.enum).toEqual(["allow", "step_up", "deny"]);
  });

  it("constrains p_agent and p_phantom to numbers in [0, 1]", () => {
    for (const field of ["p_agent", "p_phantom"] as const) {
      const p = evaluateResponse().properties[field];
      expect(p.type).toBe("number");
      expect(p.minimum).toBe(0);
      expect(p.maximum).toBe(1);
    }
  });
});
