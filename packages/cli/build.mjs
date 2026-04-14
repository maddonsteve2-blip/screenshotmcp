import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/index.js",
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire } from 'module';",
      "const require = createRequire(import.meta.url);",
    ].join("\n"),
  },
  external: ["playwright"],
  minify: false,
  sourcemap: false,
});

await esbuild.build({
  entryPoints: ["src/local-browser-daemon.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/local-browser-daemon.js",
  external: ["playwright"],
  minify: false,
  sourcemap: false,
});

console.log("CLI build complete ✓");
