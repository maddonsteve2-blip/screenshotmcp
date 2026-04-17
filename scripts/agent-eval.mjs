#!/usr/bin/env node

import { createRun, getEvalPaths, listTaskIds, resolveRunDir, scoreRun, summarizeRuns } from "./agent-eval-lib.mjs";

function printUsage() {
  console.log(`Usage:
  node scripts/agent-eval.mjs list
  node scripts/agent-eval.mjs init <task-id> [--label <label>]
  node scripts/agent-eval.mjs score <run-dir>
  node scripts/agent-eval.mjs score --all`);
}

function parseFlag(name, args) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

async function main() {
  const [, , command, ...args] = process.argv;
  const { runsDir } = getEvalPaths();

  if (!command || command === "help" || command === "--help") {
    printUsage();
    return;
  }

  if (command === "list") {
    for (const taskId of listTaskIds()) {
      console.log(taskId);
    }
    return;
  }

  if (command === "init") {
    const taskId = args[0];
    if (!taskId) {
      throw new Error("Missing task ID for init.");
    }
    const label = parseFlag("--label", args);
    const { runDir } = createRun(taskId, { label });
    console.log(`Initialized ${taskId}`);
    console.log(runDir);
    return;
  }

  if (command === "score") {
    if (args[0] === "--all") {
      const results = summarizeRuns();
      if (results.length === 0) {
        console.log(`No scored runs found in ${runsDir}`);
        return;
      }
      for (const result of results) {
        console.log(`${result.runId}\t${result.taskId}\t${result.percent}%\t${result.passed ? "pass" : "fail"}`);
      }
      return;
    }
    const runArg = args[0];
    if (!runArg) {
      throw new Error("Missing run directory for score.");
    }
    const runDir = resolveRunDir(runArg);
    const summary = scoreRun(runDir);
    console.log(`${summary.taskId}: ${summary.percent}% (${summary.passed ? "pass" : "fail"})`);
    if (!summary.passed) {
      for (const failed of summary.checks.filter((check) => !check.passed)) {
        console.log(`- ${failed.label}`);
      }
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
