#!/usr/bin/env node
// Fails if the generated content or the web-synced copies are out of date with
// the .md sources in packages/types/src/skills/deepsyte/. Intended for
// CI: run after `npm ci` and before build/test.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

function readOrEmpty(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

const generatedPath = join(__dirname, "..", "src", "skills", "content.generated.ts");
const webSkillPath = join(repoRoot, "apps", "web", "public", ".skills", "deepsyte", "SKILL.md");
const srcSkillPath = join(__dirname, "..", "src", "skills", "deepsyte", "SKILL.md");

const priorGenerated = readOrEmpty(generatedPath);
const priorWebSkill = readOrEmpty(webSkillPath);

execSync(`node ${JSON.stringify(join(__dirname, "generate-skill-content.mjs"))}`, { stdio: "inherit" });
execSync(`node ${JSON.stringify(join(__dirname, "sync-skills-to-web.mjs"))}`, { stdio: "inherit" });

const nextGenerated = readOrEmpty(generatedPath);
const nextWebSkill = readOrEmpty(webSkillPath);

const problems = [];
if (priorGenerated !== nextGenerated) {
  problems.push("packages/types/src/skills/content.generated.ts is out of date — run `pnpm --filter @deepsyte/types generate:skills`.");
}
if (priorWebSkill !== nextWebSkill) {
  problems.push("apps/web/public/.skills/deepsyte/** is out of date — run `pnpm --filter @deepsyte/types sync:skills-to-web`.");
}

// Sanity: SKILL.md source must not be empty.
if (!readOrEmpty(srcSkillPath).trim()) {
  problems.push("packages/types/src/skills/deepsyte/SKILL.md is empty.");
}

if (problems.length > 0) {
  console.error("\nSkill source verification FAILED:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log("Skill sources, generated content, and web copy are in sync.");
