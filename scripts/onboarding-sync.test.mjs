import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");

test("new-agent onboarding copy stays synchronized across static surfaces", () => {
  const output = execFileSync("node", ["scripts/sync-onboarding-copy.mjs", "--check"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  assert.match(output, /Onboarding copy is in sync\./);
});
