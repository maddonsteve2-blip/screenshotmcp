import test from "node:test";
import assert from "node:assert/strict";
import { findMagicComments } from "../src/views/magicComments";

test("findMagicComments picks up @screenshot in JS comments", () => {
  const text = `// @screenshot https://example.com\nconst x = 1;\n`;
  const matches = findMagicComments(text);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].kind, "screenshot");
  assert.equal(matches[0].urls[0], "https://example.com");
  assert.equal(matches[0].line, 0);
});

test("findMagicComments picks up @audit in Python/YAML comments", () => {
  const text = `# @audit https://example.com\n`;
  const matches = findMagicComments(text);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].kind, "audit");
});

test("findMagicComments picks up @diff with two URLs", () => {
  const text = `<!-- @diff https://staging.example.com https://example.com -->`;
  const matches = findMagicComments(text);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].kind, "diff");
  assert.deepEqual(matches[0].urls, ["https://staging.example.com", "https://example.com"]);
});

test("findMagicComments parses width/height/fullPage/delay/format options", () => {
  const text = `// @screenshot https://example.com width=1440 height=900 fullPage=false delay=2000 format=jpeg`;
  const [match] = findMagicComments(text);
  assert.deepEqual(match.options, {
    width: 1440,
    height: 900,
    fullPage: false,
    delay: 2000,
    format: "jpeg",
  });
});

test("findMagicComments clamps out-of-range integers", () => {
  const text = `// @screenshot https://example.com width=99999 height=10 delay=99999999 format=bogus`;
  const [match] = findMagicComments(text);
  assert.equal(match.options.width, 3840);
  assert.equal(match.options.height, 240);
  assert.equal(match.options.delay, 10000);
  assert.equal(match.options.format, undefined);
});

test("findMagicComments skips @diff with only one URL", () => {
  const text = `// @diff https://only.example.com`;
  assert.deepEqual(findMagicComments(text), []);
});

test("findMagicComments skips @screenshot with no URL", () => {
  const text = `// @screenshot take a picture of something`;
  assert.deepEqual(findMagicComments(text), []);
});

test("findMagicComments picks up @baseline directives", () => {
  const text = `// @baseline https://example.com\n# @baseline https://other.example.com`;
  const matches = findMagicComments(text);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].kind, "baseline");
  assert.equal(matches[0].urls[0], "https://example.com");
  assert.equal(matches[1].kind, "baseline");
});

test("findMagicComments returns multiple matches across lines", () => {
  const text = `
    // @screenshot https://a.com
    // @audit https://b.com
    // @diff https://c.com https://d.com
  `;
  const matches = findMagicComments(text);
  assert.equal(matches.length, 3);
  assert.deepEqual(matches.map((m) => m.kind), ["screenshot", "audit", "diff"]);
});
