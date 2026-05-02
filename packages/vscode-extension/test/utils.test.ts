import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkspaceMcpConfig } from "../src/utils/mcpConfig";
import { validateHttpUrl } from "../src/utils/url";

test("validateHttpUrl accepts valid http and https URLs", () => {
  assert.equal(validateHttpUrl("https://example.com"), undefined);
  assert.equal(validateHttpUrl("http://example.com"), undefined);
});

test("validateHttpUrl rejects blank and invalid protocols", () => {
  assert.equal(validateHttpUrl(""), "URL is required.");
  assert.equal(validateHttpUrl("ftp://example.com"), "URL must start with http:// or https://.");
  assert.equal(validateHttpUrl("notaurl"), "Enter a valid URL.");
});

test("buildWorkspaceMcpConfig preserves other servers and injects deepsyte", () => {
  const config = buildWorkspaceMcpConfig(
    {
      mcp: {
        servers: {
          existing: { type: "http", url: "https://example.com/mcp" },
        },
      },
    },
    "https://deepsyte-api-production.up.railway.app",
    "sk_live_test",
  );

  assert.deepEqual(config, {
    mcp: {
      servers: {
        existing: { type: "http", url: "https://example.com/mcp" },
        deepsyte: {
          type: "http",
          url: "https://deepsyte-api-production.up.railway.app/mcp/sk_live_test",
        },
      },
    },
  });
});
