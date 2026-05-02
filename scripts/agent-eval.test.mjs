import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRun, listTaskIds, scoreRun } from "./agent-eval-lib.mjs";

const evalRoot = join(process.cwd(), "evals", "agent-harness");

test("agent eval task catalog includes the initial task set", () => {
  const taskIds = listTaskIds(evalRoot);
  assert.ok(taskIds.includes("audit-public-start"));
  assert.ok(taskIds.includes("auth-plan-signin"));
  assert.ok(taskIds.includes("responsive-capture"));
});

test("agent eval init creates the expected run bundle", () => {
  const { runDir } = createRun("audit-public-start", {
    evalRoot,
    date: new Date("2026-04-17T00:00:00.000Z"),
    label: "init",
  });
  try {
    const manifest = JSON.parse(readFileSync(join(runDir, "manifest.json"), "utf8"));
    assert.equal(manifest.taskId, "audit-public-start");
    assert.match(readFileSync(join(runDir, "prompt.md"), "utf8"), /full audit deepsyte\.com/i);
    assert.equal(readFileSync(join(runDir, "first-response.md"), "utf8"), "");
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("agent eval scoring passes a compliant audit start run", () => {
  const { runDir } = createRun("audit-public-start", { evalRoot, date: new Date("2026-04-17T01:00:00.000Z"), label: "pass" });
  try {
    writeFileSync(join(runDir, "first-response.md"), [
      "I read `workflows/sitewide-performance-audit/WORKFLOW.md`.",
      "Base URL: https://deepsyte.com",
      "Tool path first: MCP first",
      "Page set: /, /pricing, /docs/quickstart, /dashboard/install, /sign-in",
      "Authenticated pages are out of scope by default.",
    ].join("\n"), "utf8");
    writeFileSync(join(runDir, "tool-calls.json"), "[]\n", "utf8");
    const summary = scoreRun(runDir, { evalRoot });
    assert.equal(summary.passed, true);
    assert.equal(summary.percent, 100);
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("agent eval scoring fails a blocking audit start run", () => {
  const { runDir } = createRun("audit-public-start", { evalRoot, date: new Date("2026-04-17T02:00:00.000Z"), label: "fail" });
  try {
    writeFileSync(join(runDir, "first-response.md"), [
      "I read `workflows/sitewide-performance-audit/WORKFLOW.md`.",
      "Tool path first: MCP first",
      "Authenticated pages are out of scope by default.",
      "Which audit scope do you want?",
      "Status: waiting for scope confirmation",
    ].join("\n"), "utf8");
    writeFileSync(join(runDir, "tool-calls.json"), JSON.stringify([{ toolName: "browser_navigate" }], null, 2), "utf8");
    const summary = scoreRun(runDir, { evalRoot });
    assert.equal(summary.passed, false);
    assert.ok(summary.checks.some((check) => check.label.includes("does not ask the user to pick an audit scope") && !check.passed));
    assert.ok(summary.checks.some((check) => check.label.includes("does not start browser work") && !check.passed));
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
});
