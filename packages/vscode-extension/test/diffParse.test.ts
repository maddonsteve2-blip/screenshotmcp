import test from "node:test";
import assert from "node:assert/strict";
import { parseDiffText } from "../src/views/diffParse";

const SAMPLE = `Visual Diff Complete!

Before: https://cdn.example.com/diff-a-abc.png
After:  https://cdn.example.com/diff-b-abc.png
Diff:   https://cdn.example.com/diff-abc.png

Changed: 12,345 pixels (1.23%)
Match score: 98.8%
Resolution: 1280x800
Threshold: 0.1`;

test("parseDiffText extracts all three image URLs", () => {
  const r = parseDiffText(SAMPLE);
  assert.equal(r.beforeUrl, "https://cdn.example.com/diff-a-abc.png");
  assert.equal(r.afterUrl, "https://cdn.example.com/diff-b-abc.png");
  assert.equal(r.diffUrl, "https://cdn.example.com/diff-abc.png");
});

test("parseDiffText parses changed pixels and match score", () => {
  const r = parseDiffText(SAMPLE);
  assert.equal(r.changedPixels, 12345);
  assert.equal(r.changedPercent, 1.23);
  assert.equal(r.matchScore, 98.8);
});

test("parseDiffText captures resolution and threshold", () => {
  const r = parseDiffText(SAMPLE);
  assert.equal(r.resolution, "1280x800");
  assert.equal(r.threshold, 0.1);
});

test("parseDiffText returns an empty object for unrelated text", () => {
  const r = parseDiffText("some error happened");
  assert.deepEqual(r, {});
});

test("parseDiffText tolerates missing fields", () => {
  const r = parseDiffText("Diff:   https://cdn.example.com/only.png\nMatch score: 100%");
  assert.equal(r.diffUrl, "https://cdn.example.com/only.png");
  assert.equal(r.matchScore, 100);
  assert.equal(r.beforeUrl, undefined);
});
