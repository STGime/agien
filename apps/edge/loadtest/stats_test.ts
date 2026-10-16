import { assertEquals } from "jsr:@std/assert@1";
import { percentile, summarize } from "./stats.ts";

Deno.test("percentile: nearest-rank over an even-sized sorted sample", () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assertEquals(percentile(xs, 50), 5);
  assertEquals(percentile(xs, 95), 10);
  assertEquals(percentile(xs, 99), 10);
});

Deno.test("percentile: single element returns that element for any p", () => {
  assertEquals(percentile([42], 50), 42);
  assertEquals(percentile([42], 99), 42);
});

Deno.test("percentile: empty input throws", () => {
  let threw = false;
  try {
    percentile([], 50);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("summarize: computes count, min, max, mean and percentiles", () => {
  const s = summarize([10, 20, 30, 40, 50]);
  assertEquals(s.count, 5);
  assertEquals(s.min, 10);
  assertEquals(s.max, 50);
  assertEquals(s.mean, 30);
  assertEquals(s.p50, 30);
});

Deno.test("summarize: sorts internally so input order is irrelevant", () => {
  const a = summarize([50, 10, 40, 20, 30]);
  const b = summarize([10, 20, 30, 40, 50]);
  assertEquals(a, b);
});
