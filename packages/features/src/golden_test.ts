import { assertEquals } from "jsr:@std/assert@1";
import { extract } from "./extract.ts";

const dir = new URL("../golden/", import.meta.url);

Deno.test("golden fixtures: TS extract matches committed expected output", async () => {
  const names: string[] = [];
  for await (const e of Deno.readDir(dir)) {
    if (e.name.endsWith(".json")) names.push(e.name);
  }
  names.sort();
  for (const name of names) {
    const fixture = JSON.parse(
      await Deno.readTextFile(new URL(`../golden/${name}`, import.meta.url)),
    );
    const vector = extract(
      { feature_vector: fixture.beacon?.feature_vector ?? null },
      fixture.request,
    );
    assertEquals(vector, fixture.expected, `${fixture.id} (${name})`);
  }
});
