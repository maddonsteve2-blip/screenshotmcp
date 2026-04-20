import test from "node:test";
import assert from "node:assert/strict";
import { parseProjectUrlsJson } from "../src/project/urlList";

test("parseProjectUrlsJson parses object with urls array of strings", () => {
  const r = parseProjectUrlsJson(JSON.stringify({ urls: ["https://a.com", "https://b.com"] }));
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.entries.map((e) => e.url), ["https://a.com", "https://b.com"]);
});

test("parseProjectUrlsJson parses object entries with labels and tags", () => {
  const input = {
    urls: [
      { url: "https://example.com", label: "Home", tags: ["marketing", "critical"] },
      { url: "https://example.com/pricing" },
    ],
  };
  const r = parseProjectUrlsJson(JSON.stringify(input));
  assert.equal(r.errors.length, 0);
  assert.equal(r.entries[0].label, "Home");
  assert.deepEqual(r.entries[0].tags, ["marketing", "critical"]);
  assert.equal(r.entries[1].label, undefined);
});

test("parseProjectUrlsJson accepts bare arrays", () => {
  const r = parseProjectUrlsJson(JSON.stringify(["https://a.com", { url: "https://b.com", label: "B" }]));
  assert.equal(r.entries.length, 2);
  assert.equal(r.entries[1].label, "B");
});

test("parseProjectUrlsJson drops invalid URLs with errors", () => {
  const r = parseProjectUrlsJson(JSON.stringify({ urls: ["not-a-url", "javascript:alert(1)", "https://ok.com"] }));
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].url, "https://ok.com");
  assert.ok(r.errors.length >= 2);
});

test("parseProjectUrlsJson deduplicates URLs", () => {
  const r = parseProjectUrlsJson(JSON.stringify({ urls: ["https://a.com", "https://a.com", { url: "https://a.com" }] }));
  assert.equal(r.entries.length, 1);
});

test("parseProjectUrlsJson reports top-level shape errors", () => {
  const r1 = parseProjectUrlsJson("null");
  assert.ok(r1.errors.length > 0);
  const r2 = parseProjectUrlsJson("{}");
  assert.ok(r2.errors.length > 0);
  const r3 = parseProjectUrlsJson("not-json");
  assert.ok(r3.errors[0].startsWith("Invalid JSON"));
});
