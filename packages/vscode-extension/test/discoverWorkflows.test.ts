import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { discoverWorkflows } from "../src/skills/discoverWorkflows";

function buildFakeSkillsRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "smcp-skills-"));
  const skillA = join(root, "screenshotsmcp", "workflows", "sitewide-performance-audit");
  mkdirSync(skillA, { recursive: true });
  writeFileSync(join(skillA, "WORKFLOW.md"), "# Sitewide Performance Audit\n\nRun steps...\n");

  const skillB = join(root, "custom-skill", "workflows", "funnel-review");
  mkdirSync(skillB, { recursive: true });
  writeFileSync(join(skillB, "WORKFLOW.md"), "Funnel review runbook without an H1.");

  // Directory without a WORKFLOW.md should be ignored
  mkdirSync(join(root, "other-skill", "workflows", "empty-one"), { recursive: true });

  return root;
}

test("discoverWorkflows returns zero workflows when root missing", () => {
  const result = discoverWorkflows(join(tmpdir(), "smcp-nonexistent-" + Date.now()));
  assert.deepEqual(result, []);
});

test("discoverWorkflows picks up WORKFLOW.md across skills and sorts by title", () => {
  const root = buildFakeSkillsRoot();
  try {
    const workflows = discoverWorkflows(root);
    assert.equal(workflows.length, 2);
    // Sorted alphabetically by title: "Funnel Review" < "Sitewide Performance Audit"
    assert.equal(workflows[0].id, "funnel-review");
    assert.equal(workflows[0].title, "Funnel Review"); // humanised from dir name (no H1)
    assert.equal(workflows[0].skill, "custom-skill");
    assert.equal(workflows[1].id, "sitewide-performance-audit");
    assert.equal(workflows[1].title, "Sitewide Performance Audit");
    assert.equal(workflows[1].skill, "screenshotsmcp");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
