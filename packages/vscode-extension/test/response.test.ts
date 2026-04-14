import test from "node:test";
import assert from "node:assert/strict";
import { extractImageUrl, extractText, parseSseResponse } from "../src/mcp/response";

test("parseSseResponse parses SSE data payloads", () => {
  const response = parseSseResponse('event: message\ndata: {"result":{"content":[{"type":"text","text":"ok"}]}}\n\n');
  assert.equal(extractText(response), "ok");
});

test("parseSseResponse falls back to JSON bodies", () => {
  const response = parseSseResponse('{"result":{"content":[{"type":"text","text":"fallback"}]}}');
  assert.equal(extractText(response), "fallback");
});

test("extractImageUrl finds image and pdf URLs in text content", () => {
  const response = parseSseResponse('{"result":{"content":[{"type":"text","text":"Screenshot ready! https://example.com/file.png"}]}}');
  assert.equal(extractImageUrl(response), "https://example.com/file.png");
});
