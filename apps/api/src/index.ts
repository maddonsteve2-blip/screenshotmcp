import "dotenv/config";
import express from "express";
import cors from "cors";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import { screenshotRouter } from "./routes/screenshot.js";
import { webhookRouter } from "./routes/webhook.js";
import { webhooksOutboundRouter } from "./routes/webhooks-outbound.js";
import { recordingsRouter } from "./routes/recordings.js";
import { runsRouter } from "./routes/runs.js";
import { screenshotsRouter } from "./routes/screenshots.js";
import { mcpRouter } from "./mcp/server.js";
import { errorHandler } from "./middleware/error.js";
import { requestId } from "./middleware/requestId.js";
import { startWorker } from "./lib/queue.js";
import { startWebhookWorker } from "./lib/webhook-delivery.js";
import { browserPool } from "./lib/browser-pool.js";
import { attachAnalyticsWs } from "./routes/analytics-ws.js";
import { attachDashboardWs } from "./routes/dashboard-ws.js";
import { createServer } from "http";

const app = express();
const PORT = process.env.PORT || 3001;
const APP_URL = process.env.APP_URL || "https://deepsyte-api-production.up.railway.app";

// Attach a stable X-Request-ID before any handler so logs, error envelopes,
// idempotency caches, and client retries can all reference the same id.
app.use(requestId);

app.use("/webhooks", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "50mb" }));
app.use(cors({
  origin: [
    process.env.WEB_URL || "https://www.deepsyte.com",
    "https://agent.deepsyte.com",
    "http://localhost:3000",
    "http://localhost:3002",
  ],
  credentials: true,
  exposedHeaders: [
    "X-Request-ID",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    "X-RateLimit-Policy",
    "Retry-After",
  ],
}));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString(), pool: browserPool.stats() });
});

// Public discovery manifest for the MCP server. AI clients (Cursor, Windsurf,
// Claude Desktop, Smithery, Pulse) probe /.well-known/mcp.json to learn the
// server name, transports, and the get-an-API-key URL.
app.get("/.well-known/mcp.json", (_req, res) => {
  const webUrl = process.env.WEB_URL || "https://www.deepsyte.com";
  res.json({
    schemaVersion: "1",
    name: "deepsyte",
    displayName: "DeepSyte",
    description:
      "Screenshots, browser automation, visual diff, and audit tooling for AI agents. 52+ MCP tools spanning Playwright sessions, full-page captures, accessibility / SEO / performance reviews, CAPTCHA solving, and signed outbound webhooks.",
    homepage: webUrl,
    docs: `${webUrl}/docs`,
    install: `${webUrl}/dashboard/install`,
    pricing: `${webUrl}/pricing`,
    changelog: `${webUrl}/changelog`,
    transports: {
      streamableHttp: {
        url: `${APP_URL}/mcp`,
        keyInPath: `${APP_URL}/mcp/{API_KEY}`,
        auth: "bearer",
      },
    },
    capabilities: ["tools"],
    contact: { email: "support@deepsyte.com" },
  });
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
  const webUrl = process.env.WEB_URL || "https://www.deepsyte.com";
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
app.use("/v1/screenshots", screenshotsRouter);
app.use("/v1/webhooks", webhooksOutboundRouter);
app.use("/webhooks", webhookRouter);
app.use("/v1/recordings", recordingsRouter);
app.use("/v1/runs", runsRouter);
app.use("/mcp", mcpRouter);

app.use(errorHandler);

const server = createServer(app);
attachAnalyticsWs(server);
attachDashboardWs(server);

server.listen(PORT, async () => {
  console.log(`API server running on port ${PORT}`);
  await browserPool.init();
  startWorker();
  startWebhookWorker();
});
