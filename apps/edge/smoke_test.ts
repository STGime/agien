import { assertEquals } from "jsr:@std/assert@1";

Deno.test("smoke: 1 + 1 === 2", () => {
  assertEquals(1 + 1, 2);
});
