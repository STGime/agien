import { parse } from "@std/yaml";

/**
 * Loads docs/openapi/agien-v0.yaml and validates an EvaluateResponse against
 * the EvaluateResponse component schema. packages/contract (Node) validates the
 * same spec with ajv; this Deno-side checker supports the JSON Schema subset
 * the spec actually uses (type, enum, minimum/maximum, format, required,
 * properties, additionalProperties:false, items, $ref) so the edge function's
 * responses are checked against the same contract.
 */

type Json = unknown;
type Schema = Record<string, Json>;

const SPEC_URL = new URL("../../../../docs/openapi/agien-v0.yaml", import.meta.url);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      if (target === undefined) throw new Error(`unresolved $ref: ${ref}`);
      return resolveRefs(target, schemas);
    }
    const out: Record<string, Json> = {};
    for (const [key, value] of Object.entries(record)) out[key] = resolveRefs(value, schemas);
    return out;
  }
  return node;
}

function matchesType(value: unknown, type: Json): boolean {
  if (Array.isArray(type)) return type.some((t) => matchesType(value, t));
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

function validateValue(schema: Schema, value: unknown, path: string, errors: string[]): void {
  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    errors.push(`${path}: expected type ${JSON.stringify(schema.type)}, got ${typeof value}`);
    return;
  }
  if (schema.enum !== undefined && !(schema.enum as Json[]).includes(value)) {
    errors.push(`${path}: value not in enum ${JSON.stringify(schema.enum)}`);
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path}: below minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path}: above maximum ${schema.maximum}`);
    }
  }
  if (typeof value === "string" && schema.format === "uuid" && !UUID_RE.test(value)) {
    errors.push(`${path}: not a valid uuid`);
  }
  if (Array.isArray(value)) {
    const items = schema.items;
    if (items !== undefined) {
      value.forEach((v, i) => validateValue(items as Schema, v, `${path}[${i}]`, errors));
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const props = schema.properties as Record<string, Schema> | undefined;
    if (props) {
      const required = schema.required as string[] | undefined;
      for (const [key, sub] of Object.entries(props)) {
        if (key in value) {
          validateValue(sub, (value as Record<string, unknown>)[key], `${path}.${key}`, errors);
        } else if (required?.includes(key)) {
          errors.push(`${path}.${key}: missing required property`);
        }
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(props ?? {}));
      for (const key of Object.keys(value as Record<string, unknown>)) {
        if (!allowed.has(key)) errors.push(`${path}.${key}: unexpected property`);
      }
    }
  }
}

export interface ContractValidation {
  ok: boolean;
  errors: string[];
}

export function validateEvaluateResponse(response: unknown): ContractValidation {
  const spec = parse(Deno.readTextFileSync(SPEC_URL)) as {
    components: { schemas: Record<string, Json> };
  };
  const schemas = spec.components.schemas;
  const schema = resolveRefs(schemas.EvaluateResponse, schemas) as Schema;
  const errors: string[] = [];
  validateValue(schema, response, "$", errors);
  return { ok: errors.length === 0, errors };
}
