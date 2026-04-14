const esbuild = require("esbuild");

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/extension.js",
  external: ["vscode"],
  sourcemap: true,
  minify: false,
};

async function run() {
  if (process.argv.includes("--watch")) {
    const context = await esbuild.context(options);
    await context.watch();
    console.log("VS Code extension watch mode started ✓");
    return;
  }

  await esbuild.build(options);
  console.log("VS Code extension build complete ✓");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
