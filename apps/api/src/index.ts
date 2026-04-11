import "dotenv/config";
import express from "express";
import cors from "cors";
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
