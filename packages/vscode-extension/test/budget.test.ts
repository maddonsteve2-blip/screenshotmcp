import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BUDGET, parseBudgetJson } from "../src/project/budget";

test("parseBudgetJson uses defaults when fields are missing", () => {
  const r = parseBudgetJson("{}");
  assert.deepEqual(r.budget, DEFAULT_BUDGET);
  assert.equal(r.errors.length, 0);
});

test("parseBudgetJson honours explicit values", () => {
  const r = parseBudgetJson(JSON.stringify({ maxFindingsPerUrl: 5, maxTotalFindings: 100, warnThreshold: 30 }));
  assert.equal(r.budget.maxFindingsPerUrl, 5);
  assert.equal(r.budget.maxTotalFindings, 100);
  assert.equal(r.budget.warnThreshold, 30);
});

test("parseBudgetJson clamps out-of-range values", () => {
  const r = parseBudgetJson(JSON.stringify({ maxFindingsPerUrl: 99999, maxTotalFindings: 0, warnThreshold: -5 }));
  assert.equal(r.budget.maxFindingsPerUrl, 1000);
  assert.equal(r.budget.maxTotalFindings, 1);
  assert.equal(r.budget.warnThreshold, 1);
  assert.ok(r.errors.length >= 1);
});

test("parseBudgetJson reports invalid types", () => {
  const r = parseBudgetJson(JSON.stringify({ maxFindingsPerUrl: "ten" }));
  assert.equal(r.budget.maxFindingsPerUrl, DEFAULT_BUDGET.maxFindingsPerUrl);
  assert.ok(r.errors[0].includes("maxFindingsPerUrl"));
});

test("parseBudgetJson reads categories array and lowercases", () => {
  const r = parseBudgetJson(JSON.stringify({ categories: ["Accessibility", "Performance"] }));
  assert.deepEqual(r.budget.categories, ["accessibility", "performance"]);
});

test("parseBudgetJson reports invalid JSON and falls back to defaults", () => {
  const r = parseBudgetJson("not json");
  assert.deepEqual(r.budget, DEFAULT_BUDGET);
  assert.ok(r.errors[0].startsWith("Invalid JSON"));
});

test("parseBudgetJson rejects top-level arrays", () => {
  const r = parseBudgetJson("[]");
  assert.deepEqual(r.budget, DEFAULT_BUDGET);
  assert.ok(r.errors.length === 1);
});
