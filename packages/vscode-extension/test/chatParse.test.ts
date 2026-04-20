import test from "node:test";
import assert from "node:assert/strict";
import { extractUrl, inferCommand } from "../src/chat/parse";

test("inferCommand detects screenshot intent", () => {
  assert.equal(inferCommand("screenshot https://example.com"), "screenshot");
  assert.equal(inferCommand("snap the homepage"), "screenshot");
  assert.equal(inferCommand("please capture this"), "screenshot");
});

test("inferCommand detects audit intent", () => {
  assert.equal(inferCommand("audit https://example.com"), "audit");
  assert.equal(inferCommand("run a UX review"), "audit");
});

test("inferCommand detects workflow and timeline", () => {
  assert.equal(inferCommand("show me a workflow"), "workflow");
  assert.equal(inferCommand("open the runbook"), "workflow");
  assert.equal(inferCommand("what's in the timeline?"), "timeline");
  assert.equal(inferCommand("recent activity"), "timeline");
});

test("inferCommand detects diff intent", () => {
  assert.equal(inferCommand("diff https://a.com https://b.com"), "diff");
  assert.equal(inferCommand("compare staging and prod"), "diff");
  assert.equal(inferCommand("run a visual diff"), "diff");
});

test("inferCommand returns undefined for unrelated prompts", () => {
  assert.equal(inferCommand("hello world"), undefined);
  assert.equal(inferCommand(""), undefined);
});

test("extractUrl pulls the first http/https URL", () => {
  assert.equal(extractUrl("check https://example.com/path?x=1 please"), "https://example.com/path?x=1");
  assert.equal(extractUrl("visit http://localhost:3000"), "http://localhost:3000");
});

test("extractUrl returns undefined when no URL is present", () => {
  assert.equal(extractUrl("example.com without protocol"), undefined);
  assert.equal(extractUrl(""), undefined);
});

test("extractUrl trims trailing quotes and parens", () => {
  assert.equal(extractUrl('please look at "https://example.com/foo"'), "https://example.com/foo");
  assert.equal(extractUrl("see (https://example.com/foo) for more"), "https://example.com/foo");
});
