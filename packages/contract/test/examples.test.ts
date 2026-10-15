import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = resolve(pkgRoot, "../../docs/openapi/agien-v0.yaml");
const examplesRoot = resolve(pkgRoot, "../../docs/openapi/examples");

// Example filename prefix -> OpenAPI component schema name.
const SCHEMA_BY_PREFIX: Record<string, string> = {
  "evaluate.request": "EvaluateRequest",
  "evaluate.response": "EvaluateResponse",
  "beacon.request": "BeaconRequest",
  "outcomes.request": "OutcomeRequest",
};

type Json = unknown;

function buildAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

/**
 * Expand every internal `#/components/schemas/*` $ref into its target so a
 * single component schema can be validated in isolation (ajv has no access to
 * the surrounding OpenAPI document).
 */
function resolveRefs(node: Json, schemas: Record<string, Json>): Json {
  if (Array.isArray(node)) {
    return node.map((item) => resolveRefs(item, schemas));
  }
  if (typeof node === "object" && node !== null) {
    const record = node as Record<string, Json>;
    const ref = record.$ref;
    if (typeof ref === "string" && ref.startsWith("#/components/schemas/")) {
      const name = ref.slice("#/components/schemas/".length);
      const target = schemas[name];
      if (target === undefined) {
        throw new Error(`unresolved $ref: ${ref}`);
      }
      return resolveRefs(target, schemas);
    }
    const out: Record<string, Json> = {};
    for (const [key, value] of Object.entries(record)) {
      out[key] = resolveRefs(value, schemas);
    }
    return out;
  }
  return node;
}

function schemasFromSpec(): Record<string, Json> {
  const spec = load(readFileSync(specPath, "utf8")) as {
    components: { schemas: Record<string, Json> };
  };
  return spec.components.schemas;
}

function schemaForExample(file: string): { schema: Json; name: string } {
  const prefix = Object.keys(SCHEMA_BY_PREFIX).find((p) =>
    file.startsWith(`${p}.`),
  );
  if (!prefix) {
    throw new Error(`no schema mapping for example file: ${file}`);
  }
  const schemas = schemasFromSpec();
  const name = SCHEMA_BY_PREFIX[prefix];
  return { schema: resolveRefs(schemas[name], schemas), name };
}

function exampleFiles(dir: "valid" | "invalid"): string[] {
  return readdirSync(join(examplesRoot, dir)).filter((f) =>
    f.endsWith(".json"),
  );
}

describe("examples/valid", () => {
  it("every valid example validates against its schema", () => {
    const ajv = buildAjv();
    const files = exampleFiles("valid");
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      const { schema, name } = schemaForExample(file);
      const json = JSON.parse(
        readFileSync(join(examplesRoot, "valid", file), "utf8"),
      );
      const ok = ajv.validate(schema, json);
      if (!ok) {
        throw new Error(
          `${name} example ${file} failed: ${JSON.stringify(ajv.errors)}`,
        );
      }
    }
  });
});

describe("examples/invalid", () => {
  it("every invalid example is rejected with at least one schema error", () => {
    const ajv = buildAjv();
    const files = exampleFiles("invalid");
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      const { schema, name } = schemaForExample(file);
      const json = JSON.parse(
        readFileSync(join(examplesRoot, "invalid", file), "utf8"),
      );
      const ok = ajv.validate(schema, json);
      expect(ok, `${name} example ${file} should be rejected`).toBe(false);
      expect(ajv.errors?.length ?? 0).toBeGreaterThanOrEqual(1);
    }
  });
});
