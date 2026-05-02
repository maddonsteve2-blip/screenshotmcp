#!/usr/bin/env node
// Copies packages/types/src/skills/deepsyte/** to
// apps/web/public/.skills/deepsyte/** so the hosted docs site serves the
// same bytes installed by the CLI and extension. Run after editing skill
// sources. CI should run `verify-skills.mjs` to catch drift.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..", "src", "skills", "deepsyte");
const destRoot = join(__dirname, "..", "..", "..", "apps", "web", "public", ".skills", "deepsyte");

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      yield* walk(full);
    } else if (s.isFile()) {
      yield full;
    }
  }
}

let copied = 0;
for (const file of walk(srcRoot)) {
  const rel = relative(srcRoot, file);
  const dest = join(destRoot, rel);
  const bytes = readFileSync(file);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  copied += 1;
  console.log(`  ${rel}`);
}

console.log(`Synced ${copied} skill file(s) to ${destRoot}`);
