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
import { db } from "./lib/db.js";
import { issueMcpOAuthToken, validateMcpOAuthToken } from "./lib/auth-tokens.js";
import { users } from "@deepsyte/db";
import { eq } from "drizzle-orm";

const app = express();
const PORT = process.env.PORT || 3001;
const APP_URL = process.env.APP_URL || "https://deepsyte-api-production.up.railway.app";
const MCP_RESOURCE_URL = `${APP_URL}/mcp`;
const MCP_RESOURCE_METADATA_URL = `${APP_URL}/.well-known/oauth-protected-resource/mcp`;

// Attach a stable X-Request-ID before any handler so logs, error envelopes,
// idempotency caches, and client retries can all reference the same id.
app.use(requestId);

app.use("/webhooks", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "50mb" }));
const rawAgentUrls = process.env.AGENT_URL ? process.env.AGENT_URL.split(",") : [];
const agentUrls = rawAgentUrls.map((u) => u.trim()).filter(Boolean);
const allowedCorsOrigins = [
  process.env.WEB_URL || "https://www.deepsyte.com",
  "https://agent.deepsyte.com",
  "https://web-phi-eight-56.vercel.app",
  "https://screenshotmcp-api-h864.vercel.app",
  ...agentUrls,
  "http://localhost:3000",
  "http://localhost:3002",
];

app.use(cors({
  origin: allowedCorsOrigins,
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
        auth: "oauth",
      },
    },
    capabilities: ["tools"],
    contact: { email: "support@deepsyte.com" },
  });
});

function sendMcpProtectedResourceMetadata(res: express.Response) {
  res.json({
    resource: MCP_RESOURCE_URL,
    authorization_servers: [APP_URL],
    scopes_supported: ["mcp:tools"],
    bearer_methods_supported: ["header"],
    resource_name: "DeepSyte MCP Server",
  });
}

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  sendMcpProtectedResourceMetadata(res);
});

app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
  sendMcpProtectedResourceMetadata(res);
});

function sendOAuthAuthorizationServerMetadata(res: express.Response) {
  res.json({
    issuer: APP_URL,
    authorization_endpoint: `${APP_URL}/oauth/authorize`,
    token_endpoint: `${APP_URL}/oauth/token`,
    registration_endpoint: `${APP_URL}/oauth/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp:tools"],
    client_id_metadata_document_supported: false,
  });
}

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  sendOAuthAuthorizationServerMetadata(res);
});

app.get("/.well-known/oauth-authorization-server/mcp", (_req, res) => {
  sendOAuthAuthorizationServerMetadata(res);
});

app.get("/oauth/authorize", (req, res) => {
  const webUrl = process.env.WEB_URL || "https://www.deepsyte.com";
  const params = new URLSearchParams(req.query as Record<string, string>);
  const clientId = typeof req.query.client_id === "string" ? req.query.client_id : "";
  const registeredClient = registeredOAuthClients.get(clientId);
  if (registeredClient?.clientName && !params.has("client_name")) {
    params.set("client_name", registeredClient.clientName);
  }
  res.redirect(`${webUrl}/oauth/authorize?${params.toString()}`);
});

interface RegisteredOAuthClient {
  clientName: string;
  redirectUris: string[];
  registeredAt: number;
}
const registeredOAuthClients = new Map<string, RegisteredOAuthClient>();

app.post("/oauth/register", (req, res) => {
  const redirectUris = Array.isArray(req.body?.redirect_uris)
    ? req.body.redirect_uris.filter((uri: unknown): uri is string => typeof uri === "string")
    : [];
  const clientName = typeof req.body?.client_name === "string" && req.body.client_name.trim()
    ? req.body.client_name.trim().slice(0, 120)
    : "MCP Client";

  if (redirectUris.length === 0) {
    res.status(400).json({
      error: "invalid_client_metadata",
      error_description: "redirect_uris must include at least one redirect URI",
    });
    return;
  }

  const clientId = `deepsyte-mcp-${nanoid(24)}`;
  registeredOAuthClients.set(clientId, {
    clientName,
    redirectUris,
    registeredAt: Date.now(),
  });

  res.status(201).json({
    client_id: clientId,
    client_name: clientName,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    scope: "mcp:tools",
  });
});

// --- OAuth code store (in-memory, codes expire in 5 minutes) ---
interface OAuthCode {
  userId: string;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  resource?: string;
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
function resolveInternalUserId(authHeader: string | undefined): string | null {
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim();
  if (!authHeader?.startsWith("Internal ") || !internalSecret) {
    return null;
  }

  const [secret, userId] = authHeader.slice(9).split(":");
  if (secret !== internalSecret || !userId) {
    return null;
  }

  return userId;
}

app.post("/oauth/callback", async (req, res) => {
  const userId = resolveInternalUserId(req.headers.authorization);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { client_id, code_challenge, code_challenge_method, redirect_uri, resource } = req.body;
  if (!redirect_uri) {
    res.status(400).json({ error: "Missing redirect_uri" });
    return;
  }
  if (resource && resource !== MCP_RESOURCE_URL) {
    res.status(400).json({
      error: "invalid_target",
      error_description: "Unsupported OAuth resource",
    });
    return;
  }

  const code = nanoid(32);
  oauthCodes.set(code, {
    userId: user.id,
    clientId: client_id || "mcp-client",
    codeChallenge: code_challenge || "",
    codeChallengeMethod: code_challenge_method || "S256",
    redirectUri: redirect_uri,
    resource: resource || undefined,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  res.json({ code });
});

// POST /oauth/token — exchange authorization code for access token
// OAuth clients typically send application/x-www-form-urlencoded
app.post("/oauth/token", express.urlencoded({ extended: false }), async (req, res) => {
  const grantType = req.body.grant_type;
  const code = req.body.code;
  const codeVerifier = req.body.code_verifier;
  const redirectUri = req.body.redirect_uri;
  const resource = typeof req.body.resource === "string" ? req.body.resource : undefined;

  if (grantType !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  const entry = oauthCodes.get(code);
  if (!entry) {
    res.status(400).json({ error: "invalid_grant", error_description: "Code not found or expired" });
    return;
  }

  if (resource && resource !== MCP_RESOURCE_URL) {
    res.status(400).json({ error: "invalid_target", error_description: "Unsupported OAuth resource" });
    return;
  }

  if (entry.resource && resource && entry.resource !== resource) {
    res.status(400).json({ error: "invalid_target", error_description: "OAuth resource mismatch" });
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

  const token = await issueMcpOAuthToken(entry.userId, entry.clientId);

  res.json({
    access_token: token.accessToken,
    token_type: "Bearer",
    expires_in: token.expiresIn,
    scope: "mcp:tools",
  });
});

app.get("/v1/auth/whoami", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing website OAuth session" });
    return;
  }

  const token = authHeader.slice(7);
  if (!token.startsWith("dso_")) {
    res.status(401).json({ error: "Website OAuth session required" });
    return;
  }

  const auth = await validateMcpOAuthToken(token);
  if (!auth) {
    res.status(401).json({ error: "Invalid or expired website OAuth session" });
    return;
  }

  res.json({
    authenticated: true,
    authMethod: auth.authMethod,
    userId: auth.userId,
    plan: auth.plan,
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
