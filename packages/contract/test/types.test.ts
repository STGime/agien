import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tscBin = resolve(pkgRoot, "node_modules/.bin/tsc");

describe("generated types", () => {
  it("compile under tsc --noEmit and the example fixtures type-check against them", () => {
    const out = execFileSync(
      tscBin,
      ["--noEmit", "-p", resolve(pkgRoot, "tsconfig.json")],
      { encoding: "utf8", cwd: pkgRoot },
    );
    expect(out.trim()).toBe("");
  });
});
