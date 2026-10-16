import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const shared = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  sourcemap: false,
  logLevel: "info",
};

await build({
  ...shared,
  format: "iife",
  globalName: "Agien",
  outfile: "dist/agien.iife.js",
});

await build({
  ...shared,
  format: "esm",
  outfile: "dist/agien.esm.js",
});

const iife = readFileSync("dist/agien.iife.js");
console.log(`IIFE: ${iife.length} bytes raw, ${gzipSync(iife).length} bytes gzipped`);
