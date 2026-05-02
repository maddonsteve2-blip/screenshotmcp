import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthorizationUrl, createPkceChallenge } from "../src/auth/oauthUtils";

test("createPkceChallenge creates a deterministic base64url sha256 digest", () => {
  assert.equal(
    createPkceChallenge("test-verifier"),
    "JBbiqONGWPaAmwXk_8bT6UnlPfrn65D32eZlJS-zGG0",
  );
});

test("buildAuthorizationUrl includes OAuth authorization parameters", () => {
  const url = buildAuthorizationUrl(
    "https://deepsyte-api-production.up.railway.app",
    "deepsyte.deepsyte-vscode",
    "vscode://deepsyte.deepsyte-vscode/auth-callback",
    "state-123",
    "challenge-456",
  );

  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://deepsyte-api-production.up.railway.app");
  assert.equal(parsed.pathname, "/oauth/authorize");
  assert.equal(parsed.searchParams.get("client_id"), "deepsyte.deepsyte-vscode");
  assert.equal(parsed.searchParams.get("redirect_uri"), "vscode://deepsyte.deepsyte-vscode/auth-callback");
  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(parsed.searchParams.get("state"), "state-123");
  assert.equal(parsed.searchParams.get("code_challenge"), "challenge-456");
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
});
