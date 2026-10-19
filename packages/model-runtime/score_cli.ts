/**
 * CLI scorer for the parity test. Reads a model JSON and a features JSON
 * (array of feature-value objects) and prints the predicted probabilities as
 * a JSON array. Invoked by ml/tests/test_model_parity.py via `deno run`.
 *
 *   deno run --allow-read score_cli.ts <model.json> <features.json>
 */
import { type AgentModel, type FeatureValues, predict } from "./src/predict.ts";

const [modelPath, featuresPath] = Deno.args;

const model = JSON.parse(await Deno.readTextFile(modelPath)) as AgentModel;
const features = JSON.parse(await Deno.readTextFile(featuresPath)) as FeatureValues[];

const scores = features.map((f) => predict(model, f));
console.log(JSON.stringify(scores));
