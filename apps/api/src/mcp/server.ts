import { Router } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { screenshots, apiKeys, users, usageEvents } from "@screenshotsmcp/db";
import { screenshotQueue } from "../lib/queue.js";
import { createHash } from "crypto";
import { eq, and, count, gte } from "drizzle-orm";
import { PLAN_LIMITS } from "@screenshotsmcp/types";

export const mcpRouter = Router();

function createMcpServer(apiKey: string | undefined) {
  const server = new McpServer({
    name: "screenshotsmcp",
    version: "1.0.0",
  });

  server.tool(
    "take_screenshot",
    "Capture a screenshot of any URL and return a public image URL",
    {
      url: z.string().url().describe("The URL to screenshot"),
      width: z.number().int().min(320).max(3840).optional().default(1280).describe("Viewport width in pixels"),
      height: z.number().int().min(240).max(2160).optional().default(800).describe("Viewport height in pixels"),
      fullPage: z.boolean().optional().default(false).describe("Capture full scrollable page"),
      format: z.enum(["png", "jpeg", "webp"]).optional().default("png").describe("Image format"),
      delay: z.number().int().min(0).max(10000).optional().default(0).describe("Wait ms after page load"),
    },
    async (args) => {
      if (!apiKey) {
        return { content: [{ type: "text", text: "Error: API key required. Pass sk_live_... as X-API-Key header." }] };
      }

      const keyHash = createHash("sha256").update(apiKey).digest("hex");
      const [keyRow] = await db
        .select({ userId: apiKeys.userId, revoked: apiKeys.revoked, plan: users.plan })
        .from(apiKeys)
        .innerJoin(users, eq(apiKeys.userId, users.id))
        .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.revoked, false)));

      if (!keyRow) {
        return { content: [{ type: "text", text: "Error: Invalid or revoked API key." }] };
      }

      const plan = (keyRow.plan ?? "free") as "free" | "starter" | "pro";
      const limit = PLAN_LIMITS[plan].screenshotsPerMonth;
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const [usageRow] = await db
        .select({ count: count() })
        .from(usageEvents)
        .where(and(eq(usageEvents.userId, keyRow.userId), gte(usageEvents.createdAt, startOfMonth)));
      if ((usageRow?.count ?? 0) >= limit) {
        return { content: [{ type: "text", text: `Error: Monthly limit of ${limit} screenshots reached for ${plan} plan.` }] };
      }

      const id = nanoid();
      await db.insert(screenshots).values({
        id,
        userId: keyRow.userId,
        url: args.url,
        status: "pending",
        width: args.width,
        height: args.height,
        fullPage: args.fullPage,
        format: args.format,
        delay: args.delay,
      });

      await screenshotQueue.add(
        "capture",
        { id, userId: keyRow.userId, options: args },
        { jobId: id, attempts: 2, backoff: { type: "exponential", delay: 2000 } }
      );

      await db.insert(usageEvents).values({
        id: nanoid(),
        userId: keyRow.userId,
        screenshotId: id,
      });

      let attempts = 0;
      while (attempts < 30) {
        await new Promise((r) => setTimeout(r, 2000));
        const [row] = await db.select().from(screenshots).where(eq(screenshots.id, id));
        if (row?.status === "done" && row.publicUrl) {
          return {
            content: [
              { type: "text", text: `Screenshot ready: ${row.publicUrl}` },
              { type: "image", data: row.publicUrl, mimeType: `image/${row.format}` },
            ],
          };
        }
        if (row?.status === "failed") {
          return { content: [{ type: "text", text: `Screenshot failed: ${row.errorMessage}` }] };
        }
        attempts++;
      }

      return { content: [{ type: "text", text: `Screenshot timed out. Check status at /v1/screenshot/${id}` }] };
    }
  );

  return server;
}

mcpRouter.post("/", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const apiKey = req.headers["x-api-key"] as string | undefined;
  const server = createMcpServer(apiKey);

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

mcpRouter.get("/", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const apiKey = req.headers["x-api-key"] as string | undefined;
  const server = createMcpServer(apiKey);

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, {});
});
