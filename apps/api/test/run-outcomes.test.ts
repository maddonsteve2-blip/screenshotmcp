import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildRunOutcomeRecord,
  normalizeOutcomeContext,
  type OutcomeSnapshotInput,
  type RunVerdict,
} from "../src/lib/run-outcomes.ts";

type FixtureExpectation = {
  verdict: RunVerdict;
  summaryIncludes: string[];
  findingIds: string[];
  missingEvidence: string[];
  workflowUsedCorrectly: boolean;
  partial: boolean;
  primaryEvidence: "recording" | "screenshot" | "none";
  workflowRequired: boolean;
  nextActionsInclude: string[];
};

type FixtureCase = {
  name: string;
  input: OutcomeSnapshotInput;
  expected: FixtureExpectation;
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(join(currentDir, "fixtures", "run-outcomes.json"), "utf8"),
) as FixtureCase[];

test("normalizeOutcomeContext trims values and infers workflow-required audit context", () => {
  const normalized = normalizeOutcomeContext({
    taskType: " site_audit ",
    userGoal: " Audit homepage and pricing ",
    workflowUsed: " sitewide-performance-audit ",
    authScope: "out",
    toolPath: "mcp",
    pageSet: [" homepage ", "", "pricing"],
    requiredEvidence: [" screenshots ", "", "network"],
  });

  assert.deepEqual(normalized, {
    taskType: "site_audit",
    userGoal: "Audit homepage and pricing",
    workflowUsed: "sitewide-performance-audit",
    workflowRequired: true,
    authScope: "out",
    toolPath: "mcp",
    pageSet: ["homepage", "pricing"],
    requiredEvidence: ["screenshots", "network"],
  });
});

for (const fixture of fixtures) {
  test(`buildRunOutcomeRecord: ${fixture.name}`, () => {
    const result = buildRunOutcomeRecord(fixture.input);

    assert.equal(result.verdict, fixture.expected.verdict);
    assert.equal(result.validity.workflowUsedCorrectly, fixture.expected.workflowUsedCorrectly);
    assert.equal(result.validity.partial, fixture.expected.partial);
    assert.equal(result.proofCoverage.primaryEvidence, fixture.expected.primaryEvidence);
    assert.equal(result.contract.workflowRequired, fixture.expected.workflowRequired);

    assert.deepEqual(
      result.findings.map((finding) => finding.id).sort(),
      [...fixture.expected.findingIds].sort(),
    );
    assert.deepEqual(
      [...result.validity.missingEvidence].sort(),
      [...fixture.expected.missingEvidence].sort(),
    );

    for (const snippet of fixture.expected.summaryIncludes) {
      assert.equal(result.summary.includes(snippet), true, `Expected summary to include: ${snippet}`);
    }

    for (const action of fixture.expected.nextActionsInclude) {
      assert.equal(result.nextActions.includes(action), true, `Expected next action to include: ${action}`);
    }
  });
}
