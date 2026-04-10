import { build } from "esbuild";
import { readdirSync, statSync } from "fs";
import { join, relative } from "path";

// Collect all .ts files from src/
function getEntryPoints(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...getEntryPoints(full));
    } else if (full.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

await build({
  entryPoints: getEntryPoints("src"),
  outdir: "dist",
  platform: "node",
  target: "es2022",
  format: "esm",
  sourcemap: true,
  // Don't bundle — keep external imports as-is
  bundle: false,
  // Rewrite .ts → .js in output paths
  outExtension: { ".js": ".js" },
});

console.log("Build complete ✅");
