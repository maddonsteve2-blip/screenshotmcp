import { Router } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { screenshots, apiKeys, users, usageEvents } from "@screenshotsmcp/db";
import { screenshotQueue } from "../lib/queue.js";
import { createHash } from "crypto";
import { eq, and, count, gte, desc } from "drizzle-orm";
import { PLAN_LIMITS } from "@screenshotsmcp/types";

export const mcpRouter = Router();

type AuthResult =
  | { ok: true; userId: string; plan: "free" | "starter" | "pro" }
  | { ok: false; error: string };

async function validateKey(apiKey: string | undefined): Promise<AuthResult> {
  if (!apiKey) return { ok: false, error: "API key required. Pass sk_live_... as x-api-key header." };
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const [row] = await db
    .select({ userId: apiKeys.userId, plan: users.plan })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.revoked, false)));
  if (!row) return { ok: false, error: "Invalid or revoked API key." };
  return { ok: true, userId: row.userId, plan: (row.plan ?? "free") as "free" | "starter" | "pro" };
}

async function checkLimit(userId: string, plan: "free" | "starter" | "pro"): Promise<string | null> {
  const limit = PLAN_LIMITS[plan].screenshotsPerMonth;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ count: count() })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, startOfMonth)));
  if ((row?.count ?? 0) >= limit) return `Monthly limit of ${limit} reached for ${plan} plan.`;
  return null;
}

async function enqueueScreenshot(userId: string, options: {
  url: string; width: number; height: number;
  fullPage: boolean; format: "png" | "jpeg" | "webp"; delay: number;
}) {
  const id = nanoid();
  await db.insert(screenshots).values({ id, userId, status: "pending", ...options });
  await screenshotQueue.add("capture", { id, userId, options }, { jobId: id, attempts: 2, backoff: { type: "exponential", delay: 2000 } });
  await db.insert(usageEvents).values({ id: nanoid(), userId, screenshotId: id });
  return id;
}

async function pollScreenshot(id: string) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const [row] = await db.select().from(screenshots).where(eq(screenshots.id, id));
    if (row?.status === "done" && row.publicUrl) {
      try {
        const imgRes = await fetch(row.publicUrl);
        const base64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
        return {
          content: [
            { type: "text" as const, text: `Screenshot ready: ${row.publicUrl}` },
            { type: "image" as const, data: base64, mimeType: `image/${row.format ?? "png"}` },
          ],
        };
      } catch {
        return { content: [{ type: "text" as const, text: `Screenshot ready: ${row.publicUrl}` }] };
      }
    }
    if (row?.status === "failed") {
      return { content: [{ type: "text" as const, text: `Screenshot failed: ${row.errorMessage}` }] };
    }
  }
  return { content: [{ type: "text" as const, text: `Screenshot timed out after 60s. Job ID: ${id}` }] };
}

function createMcpServer(apiKey: string | undefined) {
  const server = new McpServer({ name: "screenshotsmcp", version: "1.0.0" });

  server.tool(
    "take_screenshot",
    "Capture a screenshot of any URL and return a public image URL. Use this for any URL that needs to be captured.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      width: z.number().int().min(320).max(3840).optional().default(1280).describe("Viewport width in pixels"),
      height: z.number().int().min(240).max(2160).optional().default(800).describe("Viewport height in pixels"),
      fullPage: z.boolean().optional().default(false).describe("Capture full scrollable page"),
      format: z.enum(["png", "jpeg", "webp"]).optional().default("png").describe("Image format"),
      delay: z.number().int().min(0).max(10000).optional().default(0).describe("Wait ms after page load"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };
      const id = await enqueueScreenshot(auth.userId, args);
      return pollScreenshot(id);
    }
  );

  server.tool(
    "screenshot_mobile",
    "Capture a screenshot at iPhone 14 Pro viewport (393×852). Shortcut for mobile responsive testing.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      fullPage: z.boolean().optional().default(false).describe("Capture full scrollable page"),
      format: z.enum(["png", "jpeg", "webp"]).optional().default("png").describe("Image format"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };
      const id = await enqueueScreenshot(auth.userId, { ...args, width: 393, height: 852, delay: 0 });
      return pollScreenshot(id);
    }
  );

  server.tool(
    "screenshot_fullpage",
    "Capture a full-page screenshot (entire scrollable content) of any URL.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      width: z.number().int().min(320).max(3840).optional().default(1280).describe("Viewport width in pixels"),
      format: z.enum(["png", "jpeg", "webp"]).optional().default("png").describe("Image format"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };
      const id = await enqueueScreenshot(auth.userId, { ...args, height: 800, fullPage: true, delay: 0 });
      return pollScreenshot(id);
    }
  );

  server.tool(
    "list_recent_screenshots",
    "List the most recent screenshots taken with this API key. Returns URLs and metadata.",
    {
      limit: z.number().int().min(1).max(20).optional().default(5).describe("Number of screenshots to return"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const rows = await db
        .select({ id: screenshots.id, url: screenshots.url, publicUrl: screenshots.publicUrl, status: screenshots.status, createdAt: screenshots.createdAt, format: screenshots.format, width: screenshots.width, height: screenshots.height })
        .from(screenshots)
        .where(and(eq(screenshots.userId, auth.userId), eq(screenshots.status, "done")))
        .orderBy(desc(screenshots.createdAt))
        .limit(args.limit);
      if (rows.length === 0) return { content: [{ type: "text", text: "No screenshots found." }] };
      const list = rows.map((r, i) =>
        `${i + 1}. ${r.url}\n   Image: ${r.publicUrl}\n   Size: ${r.width}×${r.height} ${r.format?.toUpperCase()}\n   Taken: ${new Date(r.createdAt).toLocaleString()}`
      ).join("\n\n");
      return { content: [{ type: "text", text: `Recent screenshots:\n\n${list}` }] };
    }
  );

  server.tool(
    "get_screenshot_status",
    "Check the status of a screenshot job by ID. Returns done/pending/failed and the public URL if ready.",
    {
      id: z.string().describe("The screenshot job ID returned when the screenshot was created"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const [row] = await db.select().from(screenshots).where(and(eq(screenshots.id, args.id), eq(screenshots.userId, auth.userId)));
      if (!row) return { content: [{ type: "text", text: "Screenshot not found." }] };
      if (row.status === "done" && row.publicUrl) {
        return { content: [{ type: "text", text: `Status: done\nURL: ${row.publicUrl}` }] };
      }
      return { content: [{ type: "text", text: `Status: ${row.status}${row.errorMessage ? `\nError: ${row.errorMessage}` : ""}` }] };
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
