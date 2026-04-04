import "dotenv/config";
import express from "express";
import { screenshotRouter } from "./routes/screenshot.js";
import { webhookRouter } from "./routes/webhook.js";
import { mcpRouter } from "./mcp/server.js";
import { errorHandler } from "./middleware/error.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use("/webhooks", express.raw({ type: "application/json" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

app.use("/v1/screenshot", screenshotRouter);
app.use("/webhooks", webhookRouter);
app.use("/mcp", mcpRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
