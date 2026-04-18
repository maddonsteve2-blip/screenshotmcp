import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.js",
  legalComments: "none",
  logLevel: "info",
  // node20 has fetch / FormData / crypto globals so no shims needed.
});

console.log("GitHub Action build complete");
