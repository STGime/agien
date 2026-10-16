import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("bundle budget", () => {
  it("IIFE build gzipped is <= 8 KB", async () => {
    const result = await build({
      entryPoints: ["src/index.ts"],
      bundle: true,
      minify: true,
      format: "iife",
      globalName: "Agien",
      write: false,
      logLevel: "silent",
    });
    const iife = result.outputFiles[0].text;
    const gz = gzipSync(iife).length;
    // print so the CI log carries the number
    console.log(`IIFE gzipped size: ${gz} bytes`);
    expect(gz).toBeLessThanOrEqual(8 * 1024);
  });
});
