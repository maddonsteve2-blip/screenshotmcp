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
import { createSession, getSession, closeSession, pageScreenshot } from "../lib/sessions.js";

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

  server.tool(
    "browser_navigate",
    "Open a browser and navigate to a URL. Returns a screenshot of the loaded page. Use this to start a browser session — the returned sessionId must be passed to all subsequent browser_ tools.",
    {
      url: z.string().url().describe("URL to navigate to"),
      sessionId: z.string().optional().describe("Existing session ID to reuse. Omit to start a new browser session."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      try {
        let sessionId = args.sessionId;
        let page;
        if (sessionId) {
          const session = await getSession(sessionId, auth.userId);
          if (!session) return { content: [{ type: "text", text: `Error: Session ${sessionId} not found or expired. Start a new one by omitting sessionId.` }] };
          page = session.page;
        } else {
          sessionId = await createSession(auth.userId);
          const session = await getSession(sessionId, auth.userId);
          page = session!.page;
        }
        await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        const img = await pageScreenshot(page);
        return { content: [{ type: "text", text: `Navigated to ${args.url}\nSession ID: ${sessionId}\n(Pass this sessionId to all browser_ tools)` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error navigating: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_click",
    "Click an element on the current browser page by CSS selector or visible text. Returns a screenshot after clicking.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      selector: z.string().describe("CSS selector (e.g. '#submit-btn', '.nav-link') or visible text to click (e.g. 'Sign in', 'Submit')"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const page = session.page;
        const el = page.locator(args.selector).first();
        if (await el.count() === 0) {
          const textEl = page.getByText(args.selector, { exact: false }).first();
          await textEl.click({ timeout: 5000 });
        } else {
          await el.click({ timeout: 5000 });
        }
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        const img = await pageScreenshot(page);
        return { content: [{ type: "text", text: `Clicked: ${args.selector}` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error clicking: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_fill",
    "Type text into an input field on the current browser page. Clears the field first, then types the value.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      selector: z.string().describe("CSS selector for the input field (e.g. '#email', 'input[name=password]', 'textarea')"),
      value: z.string().describe("Text to type into the field"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const page = session.page;
        await page.locator(args.selector).first().fill(args.value, { timeout: 5000 });
        const img = await pageScreenshot(page);
        return { content: [{ type: "text", text: `Filled ${args.selector} with value` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error filling field: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_screenshot",
    "Take a screenshot of the current browser page without performing any action.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const img = await pageScreenshot(session.page);
        const url = session.page.url();
        return { content: [{ type: "text", text: `Current URL: ${url}` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_scroll",
    "Scroll the browser page by a given amount in pixels.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      x: z.number().optional().default(0).describe("Horizontal scroll amount in pixels"),
      y: z.number().optional().default(500).describe("Vertical scroll amount in pixels (positive = down)"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        await session.page.evaluate(`window.scrollBy(${args.x}, ${args.y})`);
        await session.page.waitForTimeout(300);
        const img = await pageScreenshot(session.page);
        return { content: [{ type: "text", text: `Scrolled by (${args.x}, ${args.y})` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error scrolling: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_wait_for",
    "Wait for an element to appear on the page, then return a screenshot. Useful after navigation or form submissions.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      selector: z.string().describe("CSS selector to wait for"),
      timeout: z.number().int().min(500).max(15000).optional().default(5000).describe("Max wait time in milliseconds"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        await session.page.waitForSelector(args.selector, { timeout: args.timeout });
        const img = await pageScreenshot(session.page);
        return { content: [{ type: "text", text: `Element found: ${args.selector}` }, img] };
      } catch (err) {
        const img = await pageScreenshot(session.page).catch(() => null);
        const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
          { type: "text", text: `Element not found: ${args.selector}` },
        ];
        if (img) content.push(img);
        return { content };
      }
    }
  );

  server.tool(
    "browser_evaluate",
    "Run JavaScript in the browser page and return the result as text. Useful for extracting data, checking values, or triggering actions.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      script: z.string().describe("JavaScript expression to evaluate (e.g. 'document.title', 'document.querySelector(\\'h1\\').textContent')"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const result = await session.page.evaluate(args.script);
        return { content: [{ type: "text", text: `Result: ${JSON.stringify(result, null, 2)}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_close",
    "Close the browser session and free all resources. Always call this when the browser workflow is complete.",
    {
      sessionId: z.string().describe("Session ID to close"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      await closeSession(args.sessionId);
      return { content: [{ type: "text", text: `Session ${args.sessionId} closed.` }] };
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
