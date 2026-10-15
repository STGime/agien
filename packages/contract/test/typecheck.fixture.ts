/**
 * Compile-time type-check of the example fixtures against the generated
 * OpenAPI types. `resolveJsonModule` widens string/number literals in JSON
 * imports to `string`/`number`, so we widen the schema's literal unions the
 * same way before assigning; exact enum membership (e.g. `action`) is
 * verified at runtime by `examples.test.ts` against the same schemas.
 */
import type { components } from "../generated/agien-v0";
import evaluateRequest from "../../../docs/openapi/examples/valid/evaluate.request.json";
import evaluateResponse from "../../../docs/openapi/examples/valid/evaluate.response.json";
import beaconRequest from "../../../docs/openapi/examples/valid/beacon.request.json";
import outcomesRequest from "../../../docs/openapi/examples/valid/outcomes.request.json";

type Widen<T> = T extends string ? string
  : T extends number ? number
  : T extends boolean ? boolean
  : T extends (infer U)[] ? Widen<U>[]
  : T extends object ? { [K in keyof T]: Widen<T[K]> }
  : T;

type EvaluateRequest = components["schemas"]["EvaluateRequest"];
type EvaluateResponse = components["schemas"]["EvaluateResponse"];
type BeaconRequest = components["schemas"]["BeaconRequest"];
type OutcomeRequest = components["schemas"]["OutcomeRequest"];

const _evaluateRequest: Widen<EvaluateRequest> = evaluateRequest;
const _evaluateResponse: Widen<EvaluateResponse> = evaluateResponse;
const _beaconRequest: Widen<BeaconRequest> = beaconRequest;
const _outcomesRequest: Widen<OutcomeRequest> = outcomesRequest;

export { _beaconRequest, _evaluateRequest, _evaluateResponse, _outcomesRequest };
