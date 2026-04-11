import "dotenv/config";
import express from "express";
import cors from "cors";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import { screenshotRouter } from "./routes/screenshot.js";
import { webhookRouter } from "./routes/webhook.js";
import { recordingsRouter } from "./routes/recordings.js";
import { mcpRouter } from "./mcp/server.js";
import { errorHandler } from "./middleware/error.js";
import { startWorker } from "./lib/queue.js";
import { browserPool } from "./lib/browser-pool.js";

const app = express();
const PORT = process.env.PORT || 3001;
const APP_URL = process.env.APP_URL || "https://screenshotsmcp-api-production.up.railway.app";

app.use("/webhooks", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(cors({ origin: [process.env.WEB_URL || "https://web-phi-eight-56.vercel.app", "http://localhost:3000"], credentials: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString(), pool: browserPool.stats() });
});

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: `${APP_URL}/mcp`,
    authorization_servers: [APP_URL],
    scopes_supported: ["mcp:tools"],
    bearer_methods_supported: ["header"],
  });
});

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: APP_URL,
    authorization_endpoint: `${APP_URL}/oauth/authorize`,
    token_endpoint: `${APP_URL}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

app.get("/oauth/authorize", (req, res) => {
  const webUrl = process.env.WEB_URL || "https://web-phi-eight-56.vercel.app";
  const params = new URLSearchParams(req.query as Record<string, string>);
  res.redirect(`${webUrl}/oauth/authorize?${params.toString()}`);
});

// --- OAuth code store (in-memory, codes expire in 5 minutes) ---
interface OAuthCode {
  apiKey: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  expiresAt: number;
}
const oauthCodes = new Map<string, OAuthCode>();

// Cleanup expired codes every minute
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of oauthCodes) {
    if (now > entry.expiresAt) oauthCodes.delete(code);
  }
}, 60_000);

// POST /oauth/callback — called by the web dashboard after user approves
// Body: { api_key, code_challenge, code_challenge_method, redirect_uri }
// Returns: { code } to redirect back to the MCP client
app.post("/oauth/callback", (req, res) => {
  const { api_key, code_challenge, code_challenge_method, redirect_uri } = req.body;
  if (!api_key || !redirect_uri) {
    res.status(400).json({ error: "Missing api_key or redirect_uri" });
    return;
  }

  const code = nanoid(32);
  oauthCodes.set(code, {
    apiKey: api_key,
    codeChallenge: code_challenge || "",
    codeChallengeMethod: code_challenge_method || "S256",
    redirectUri: redirect_uri,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  res.json({ code });
});

// POST /oauth/token — exchange authorization code for access token
// OAuth clients typically send application/x-www-form-urlencoded
app.post("/oauth/token", express.urlencoded({ extended: false }), (req, res) => {
  const grantType = req.body.grant_type;
  const code = req.body.code;
  const codeVerifier = req.body.code_verifier;
  const redirectUri = req.body.redirect_uri;

  if (grantType !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  const entry = oauthCodes.get(code);
  if (!entry) {
    res.status(400).json({ error: "invalid_grant", error_description: "Code not found or expired" });
    return;
  }

  // Verify PKCE
  if (entry.codeChallenge && codeVerifier) {
    const computed = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    if (computed !== entry.codeChallenge) {
      res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
      return;
    }
  }

  // Verify redirect URI matches
  if (entry.redirectUri && redirectUri && entry.redirectUri !== redirectUri) {
    res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
    return;
  }

  // Delete the code (one-time use)
  oauthCodes.delete(code);

  // Return the API key as the access token
  res.json({
    access_token: entry.apiKey,
    token_type: "Bearer",
    scope: "mcp:tools",
  });
});

app.use("/v1/screenshot", screenshotRouter);
app.use("/webhooks", webhookRouter);
app.use("/v1/recordings", recordingsRouter);
app.use("/mcp", mcpRouter);

app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`API server running on port ${PORT}`);
  await browserPool.init();
  startWorker();
});
