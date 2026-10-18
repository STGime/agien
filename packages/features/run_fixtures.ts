/**
 * Compute the TS feature vector for every golden fixture and print the result
 * as a JSON list of { id, vector }. Invoked by the Python parity test
 * (ml/tests/test_parity.py) as a subprocess so both implementations are
 * exercised over the same inputs.
 */
import { extract } from "./src/extract.ts";

const dir = new URL("./golden/", import.meta.url);

const names: string[] = [];
for await (const e of Deno.readDir(dir)) {
  if (e.name.endsWith(".json")) names.push(e.name);
}
names.sort();

const out: Array<{ id: string; vector: unknown }> = [];
for (const name of names) {
  const fixture = JSON.parse(
    await Deno.readTextFile(new URL(`./golden/${name}`, import.meta.url)),
  );
  const vector = extract(
    { feature_vector: fixture.beacon?.feature_vector ?? null },
    fixture.request,
  );
  out.push({ id: fixture.id, vector });
}

console.log(JSON.stringify(out));
