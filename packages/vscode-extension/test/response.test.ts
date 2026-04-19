import test from "node:test";
import assert from "node:assert/strict";
import { extractImageUrl, extractRunUrl, extractText, parseSseResponse } from "../src/mcp/response";

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

test("extractRunUrl returns direct /dashboard/runs/<id> URL when present", () => {
  const url = extractRunUrl(
    "Audit complete. See https://www.screenshotmcp.com/dashboard/runs/run_abc123 for details.",
    "https://www.screenshotmcp.com/dashboard",
  );
  assert.equal(url, "https://www.screenshotmcp.com/dashboard/runs/run_abc123");
});

test("extractRunUrl synthesises a run URL from a run id mention", () => {
  const url = extractRunUrl("Kicked off run id: run_xyz789 on Railway.", "https://www.screenshotmcp.com/dashboard");
  assert.equal(url, "https://www.screenshotmcp.com/dashboard/runs/run_xyz789");
});

test("extractRunUrl returns undefined when no run id or url is present", () => {
  assert.equal(extractRunUrl("Nothing relevant here.", "https://www.screenshotmcp.com/dashboard"), undefined);
});
