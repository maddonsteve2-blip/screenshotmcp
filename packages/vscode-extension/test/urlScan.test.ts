import test from "node:test";
import assert from "node:assert/strict";
import { findUrlsForCodeLens } from "../src/views/urlScan";

test("findUrlsForCodeLens picks up bare URLs in prose", () => {
  const matches = findUrlsForCodeLens("See https://example.com/page for details.");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].url, "https://example.com/page");
  assert.equal(matches[0].index, 4);
});

test("findUrlsForCodeLens trims trailing punctuation", () => {
  const matches = findUrlsForCodeLens("Ping https://api.example.com/health, then retry.");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].url, "https://api.example.com/health");
});

test("findUrlsForCodeLens stops at JSON quotes and commas", () => {
  const json = '{"homepage":"https://www.screenshotmcp.com","docs":"https://www.screenshotmcp.com/docs"}';
  const matches = findUrlsForCodeLens(json);
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map((m) => m.url), [
    "https://www.screenshotmcp.com",
    "https://www.screenshotmcp.com/docs",
  ]);
});

test("findUrlsForCodeLens respects the max cap", () => {
  const text = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`).join(" ");
  const matches = findUrlsForCodeLens(text, 3);
  assert.equal(matches.length, 3);
});

test("findUrlsForCodeLens ignores URLs shorter than 10 chars", () => {
  // "http://a" is only 8 chars — should be dropped.
  const matches = findUrlsForCodeLens("http://a http://example.com");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].url, "http://example.com");
});
