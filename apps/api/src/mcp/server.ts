import { Router, Request, Response } from "express";
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
import { createSession, getSession, closeSession, pageScreenshot, navigateWithRetry, setSessionViewport } from "../lib/sessions.js";
import { browserPool } from "../lib/browser-pool.js";

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
  darkMode?: boolean; selector?: string; pdf?: boolean; maxHeight?: number;
}) {
  const id = nanoid();
  await db.insert(screenshots).values({
    id, userId, status: "pending",
    url: options.url, width: options.width, height: options.height,
    fullPage: options.fullPage, format: options.format, delay: options.delay,
  });
  await screenshotQueue.add("capture", { id, userId, options }, { jobId: id, attempts: 2, backoff: { type: "exponential", delay: 2000 } });
  await db.insert(usageEvents).values({ id: nanoid(), userId, screenshotId: id });
  return id;
}

async function pollScreenshot(id: string) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const [row] = await db.select().from(screenshots).where(eq(screenshots.id, id));
    if (row?.status === "done" && row.publicUrl) {
      return {
        content: [
          { type: "text" as const, text: `Screenshot ready!\nURL: ${row.publicUrl}\nSize: ${row.width ?? "?"}×${row.height ?? "?"} ${(row.format ?? "png").toUpperCase()}` },
        ],
      };
    }
    if (row?.status === "failed") {
      return { content: [{ type: "text" as const, text: `Screenshot failed: ${row.errorMessage}` }] };
    }
  }
  return { content: [{ type: "text" as const, text: `Screenshot timed out after 60s. Job ID: ${id}` }] };
}

function createMcpServer(apiKey: string | undefined) {
  const server = new McpServer({
    name: "screenshotsmcp",
    version: "1.0.0",
    description: `You have access to screenshotsmcp — a tool suite for capturing screenshots and automating browsers.

## Screenshot Tools (quick captures, no session needed)
- **take_screenshot** — capture any URL at a custom viewport size. Supports fullPage (default) or viewport-only mode. Returns a public image URL with dimensions.
- **screenshot_mobile** — iPhone 14 Pro viewport (393×852). Supports viewport-only or full-page.
- **screenshot_tablet** — iPad viewport (820×1180). Supports viewport-only or full-page.
- **screenshot_fullpage** — capture the entire scrollable page (always full-page). Use max_height to cap long pages.
- **screenshot_responsive** — capture desktop + tablet + mobile in ONE call. Supports viewport-only mode. Best for responsive design checks.
- **screenshot_dark** — capture with dark mode emulated (prefers-color-scheme: dark).
- **screenshot_element** — capture a specific element by CSS selector. Waits for the element to appear (SPA-friendly). Supports delay param.
- **screenshot_pdf** — export a webpage as a PDF document (A4, with backgrounds).
- **list_recent_screenshots** — view recent screenshot URLs and metadata.
- **get_screenshot_status** — check if a screenshot job is done.

## Browser Automation Tools (interactive sessions)
Use these for multi-step workflows like logging in, filling forms, or navigating through a site:
1. Start with **browser_navigate** to open a URL — this returns a sessionId.
2. Pass that sessionId to all subsequent tools.
3. Call **browser_close** when done to free resources.

**Interaction:** browser_click, browser_fill, browser_hover, browser_select_option, browser_scroll, browser_press_key
**Navigation:** browser_navigate (supports width/height params), browser_go_back, browser_go_forward, browser_wait_for
**Viewport:** browser_set_viewport — resize the browser viewport mid-session (e.g. switch between desktop and mobile)
**Inspection:** browser_screenshot, browser_get_text, browser_get_html, browser_get_accessibility_tree, browser_evaluate
**Standalone:** accessibility_snapshot — get accessibility tree for any URL without a session
**Performance:** browser_perf_metrics (Core Web Vitals: LCP, FCP, CLS, TTFB), browser_network_requests (full waterfall)
**SEO:** browser_seo_audit (meta, OG, Twitter cards, headings, structured data, alt text)
**Debugging:** browser_console_logs, browser_network_errors, browser_cookies, browser_storage

## Smart Login Flow
When the user asks you to test a flow that requires authentication (login, sign-in, etc.):
1. Call **find_login_page** with the site's base URL. It checks the sitemap.xml and common login paths automatically.
2. It returns a list of candidate login URLs found. Pick the best one (or ask the user if ambiguous).
3. Call **browser_navigate** to go to the login page.
4. **Ask the user** for their username/email and password. NEVER guess credentials.
5. Use **browser_fill** and **browser_click** to fill in the form and submit.
6. Take a **browser_screenshot** and check if login succeeded (look for dashboard, profile, or redirect away from login).
7. Report back: "Login successful" or "Login failed — [reason]".
8. If login fails, ask the user for the exact login URL and try again.
9. Once logged in, proceed with the requested testing flow.

## Tips
- Screenshot tools return a public CDN URL (not inline images) **with dimensions**. Check dimensions to judge if the image will be useful.
- For responsive testing, prefer screenshot_responsive — it's faster than 3 separate calls.
- **For long pages** (e.g. product grids), use **fullPage: false** (viewport-only) or set **max_height** to cap the image height. Full-page captures on long pages produce unreadable strips.
- Browser tools return a JPEG screenshot after each action so you can see the result.
- Use **browser_set_viewport** to resize the browser mid-session for mobile/tablet testing without starting a new session.
- Use **browser_navigate** with width/height params to start a mobile session directly.
- **browser_get_accessibility_tree** is the best way to understand page structure for UX analysis.
- **accessibility_snapshot** does the same thing without needing a session — just pass a URL.
- **browser_console_logs** and **browser_network_errors** capture errors automatically from the moment the session starts.
- When the user says "take a screenshot", use take_screenshot. When they say "check responsive", use screenshot_responsive.
- When the user says "audit this site" or "check UX", use browser_navigate + browser_get_accessibility_tree + browser_console_logs.`,
  });

  // @ts-ignore - TS2589: MCP SDK generic inference too deep with multiple .default() fields
  server.tool(
    "take_screenshot",
    "Capture a screenshot of any URL and return a public image URL. By default captures the full scrollable page. Set fullPage to false for viewport-only capture (recommended for long pages). Returns image dimensions in the response.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      width: z.number().int().min(320).max(3840).default(1280).describe("Viewport width in pixels"),
      height: z.number().int().min(240).max(2160).default(800).describe("Viewport height in pixels"),
      fullPage: z.boolean().default(true).describe("If true, captures entire scrollable page. Set to false for viewport-only capture (recommended for long pages like product grids)."),
      maxHeight: z.number().int().min(100).max(20000).optional().describe("Maximum image height in pixels. Caps extremely tall full-page captures to prevent unreadable strips."),
      format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Image format"),
      delay: z.number().int().min(0).max(10000).default(0).describe("Wait ms after page load"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };
      const id = await enqueueScreenshot(auth.userId, { url: args.url, width: args.width, height: args.height, fullPage: args.fullPage, format: args.format, delay: args.delay, maxHeight: args.maxHeight });
      return pollScreenshot(id);
    }
  );

  server.tool(
    "screenshot_mobile",
    "Capture a screenshot at iPhone 14 Pro viewport (393×852). By default captures viewport-only (not the full scrollable page). Set fullPage to true for full-page capture.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      fullPage: z.boolean().default(false).describe("If true, captures entire scrollable page. Default false = viewport-only (recommended for mobile)."),
      format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Image format"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };
      const id = await enqueueScreenshot(auth.userId, { url: args.url, width: 393, height: 852, fullPage: args.fullPage, format: args.format, delay: 0 });
      return pollScreenshot(id);
    }
  );

  server.tool(
    "screenshot_tablet",
    "Capture a screenshot at iPad viewport (820×1180). By default captures viewport-only (not the full scrollable page). Set fullPage to true for full-page capture.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      fullPage: z.boolean().default(false).describe("If true, captures entire scrollable page. Default false = viewport-only (recommended for tablet)."),
      format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Image format"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };
      const id = await enqueueScreenshot(auth.userId, { url: args.url, width: 820, height: 1180, fullPage: args.fullPage, format: args.format, delay: 0 });
      return pollScreenshot(id);
    }
  );

  server.tool(
    "screenshot_responsive",
    "Capture screenshots at desktop (1280×800), tablet (820×1180), and mobile (393×852) viewports in one call. By default captures viewport-only (recommended). Set fullPage to true for full-page captures. Returns all three URLs for responsive comparison.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      fullPage: z.boolean().default(false).describe("If true, captures entire scrollable page at each viewport. Default false = viewport-only (recommended)."),
      format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Image format"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      for (let i = 0; i < 3; i++) {
        const limitErr = await checkLimit(auth.userId, auth.plan);
        if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };
      }
      const viewports = [
        { name: "Desktop (1280×800)", width: 1280, height: 800 },
        { name: "Tablet (820×1180)", width: 820, height: 1180 },
        { name: "Mobile (393×852)", width: 393, height: 852 },
      ];
      const ids = await Promise.all(
        viewports.map(vp => enqueueScreenshot(auth.userId, { url: args.url, format: args.format, ...vp, fullPage: args.fullPage, delay: 0 }))
      );
      const results = await Promise.all(ids.map(id => pollScreenshot(id)));
      const texts = results.map((r, i) => {
        const text = r.content.find(c => c.type === "text") as { text: string } | undefined;
        return `${viewports[i].name}:\n${text?.text || "Error"}`;
      });
      return { content: [{ type: "text", text: texts.join("\n\n") }] };
    }
  );

  server.tool(
    "screenshot_fullpage",
    "Capture a full-page screenshot (entire scrollable content) of any URL. Use max_height to cap extremely long pages and prevent unreadable strips.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      width: z.number().int().min(320).max(3840).default(1280).describe("Viewport width in pixels"),
      maxHeight: z.number().int().min(100).max(20000).optional().describe("Maximum image height in pixels. Caps extremely tall full-page captures."),
      format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Image format"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };
      const id = await enqueueScreenshot(auth.userId, { url: args.url, width: args.width, height: 800, fullPage: true, format: args.format, delay: 0, maxHeight: args.maxHeight });
      return pollScreenshot(id);
    }
  );

  server.tool(
    "screenshot_dark",
    "Capture a full-page screenshot with dark mode (prefers-color-scheme: dark) emulated. Works on sites that support dark mode via CSS media queries.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      width: z.number().int().min(320).max(3840).default(1280).describe("Viewport width in pixels"),
      height: z.number().int().min(240).max(2160).default(800).describe("Viewport height in pixels"),
      format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Image format"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };
      const id = await enqueueScreenshot(auth.userId, { ...args, fullPage: true, delay: 0, darkMode: true });
      return pollScreenshot(id);
    }
  );

  server.tool(
    "screenshot_element",
    "Capture a screenshot of a specific element on the page by CSS selector. Only the matched element is captured, not the full page. Automatically waits for the element to appear (SPA-friendly). Use delay for pages that need extra hydration time.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      selector: z.string().describe("CSS selector of the element to capture (e.g. '#hero', '.pricing-table', 'main > section:first-child')"),
      delay: z.number().int().min(0).max(10000).default(0).describe("Extra wait in ms after page load before capturing. Use 2000-5000 for SPAs that need hydration time."),
      format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Image format"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };
      const id = await enqueueScreenshot(auth.userId, { url: args.url, width: 1280, height: 800, fullPage: false, format: args.format, delay: args.delay, selector: args.selector });
      return pollScreenshot(id);
    }
  );

  server.tool(
    "screenshot_pdf",
    "Export a webpage as a PDF document (A4 format with background graphics). Returns a public URL to the PDF file.",
    {
      url: z.string().url().describe("The URL to export as PDF"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };
      const id = await enqueueScreenshot(auth.userId, { url: args.url, width: 1280, height: 800, fullPage: false, format: "png", delay: 0, pdf: true });
      return pollScreenshot(id);
    }
  );

  server.tool(
    "list_recent_screenshots",
    "List the most recent screenshots taken with this API key. Returns URLs and metadata.",
    {
      limit: z.number().int().min(1).max(20).default(5).describe("Number of screenshots to return"),
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
    "Open a browser and navigate to a URL. Returns a screenshot of the loaded page. Use this to start a browser session — the returned sessionId must be passed to all subsequent browser_ tools. Pass width/height to start with a custom viewport (e.g. 393×852 for mobile).",
    {
      url: z.string().url().describe("URL to navigate to"),
      sessionId: z.string().optional().describe("Existing session ID to reuse. Omit to start a new browser session."),
      width: z.number().int().min(320).max(3840).optional().describe("Viewport width for new sessions (default 1280). Ignored if sessionId is provided."),
      height: z.number().int().min(240).max(2160).optional().describe("Viewport height for new sessions (default 800). Ignored if sessionId is provided."),
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
          const vp = (args.width || args.height) ? { width: args.width || 1280, height: args.height || 800 } : undefined;
          sessionId = await createSession(auth.userId, vp);
          const session = await getSession(sessionId, auth.userId);
          page = session!.page;
        }
        await navigateWithRetry(page, args.url);
        const img = await pageScreenshot(page);
        const vpSize = page.viewportSize();
        return { content: [{ type: "text", text: `Navigated to ${args.url}\nSession ID: ${sessionId}\nViewport: ${vpSize?.width}×${vpSize?.height}\n(Pass this sessionId to all browser_ tools)` }, img] };
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
      x: z.number().default(0).describe("Horizontal scroll amount in pixels"),
      y: z.number().default(500).describe("Vertical scroll amount in pixels (positive = down)"),
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
      timeout: z.number().int().min(500).max(15000).default(5000).describe("Max wait time in milliseconds"),
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
    "browser_set_viewport",
    "Resize the browser viewport in an existing session. Useful for testing responsive layouts without starting a new session — e.g. switch between desktop (1280×800), tablet (820×1180), and mobile (393×852). Returns a screenshot after resizing.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      width: z.number().int().min(320).max(3840).describe("New viewport width in pixels"),
      height: z.number().int().min(240).max(2160).describe("New viewport height in pixels"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const ok = await setSessionViewport(args.sessionId, auth.userId, args.width, args.height);
      if (!ok) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      await session.page.waitForTimeout(500);
      const img = await pageScreenshot(session.page);
      return { content: [{ type: "text", text: `Viewport resized to ${args.width}×${args.height}` }, img] };
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

  // @ts-ignore - TS2589: MCP SDK generic inference too deep with multiple .default() fields
  server.tool(
    "browser_get_accessibility_tree",
    "Get the accessibility tree of the current page. Returns a structured snapshot of all interactive elements, headings, links, buttons, form fields, images with alt text, and ARIA roles. This is the BEST tool for understanding page structure and UX without looking at screenshots.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      maxDepth: z.number().int().min(1).max(20).default(8).describe("Maximum depth of the tree to return"),
      interestingOnly: z.boolean().default(true).describe("If true, only return nodes that are typically interesting for UX analysis (buttons, links, inputs, headings, images). Set false for the full tree."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const tree = await session.page.evaluate(({ maxDepth, interestingOnly }: any) => {
          const IR = new Set(["button","link","textbox","checkbox","radio","combobox","listbox","menuitem","tab","heading","img","navigation","main","banner","contentinfo","search","form","dialog","alert","progressbar","slider"]);
          const IT: any = {A:"link",BUTTON:"button",INPUT:"textbox",TEXTAREA:"textbox",SELECT:"combobox",IMG:"img",NAV:"navigation",MAIN:"main",HEADER:"banner",FOOTER:"contentinfo",FORM:"form",DIALOG:"dialog",H1:"heading",H2:"heading",H3:"heading",H4:"heading",H5:"heading",H6:"heading"};
          const ITAGS = ["A","BUTTON","INPUT","TEXTAREA","SELECT","IMG","NAV","MAIN","HEADER","FOOTER","FORM","H1","H2","H3","H4","H5","H6"];

          function walk(el: any, depth: number): any {
            if (!el || depth <= 0) return null;
            const tag = el.tagName || "";
            const role = (el.getAttribute && el.getAttribute("role")) || IT[tag] || "";
            const name = (el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("title") || el.getAttribute("placeholder"))) || (el.innerText ? el.innerText.slice(0, 80) : "") || "";
            const isInteresting = IR.has(role) || (el.getAttribute && el.getAttribute("role")) || ITAGS.includes(tag);

            const kids: any[] = [];
            if (el.children) {
              for (let i = 0; i < el.children.length; i++) {
                const c = walk(el.children[i], depth - 1);
                if (c) { if (Array.isArray(c)) kids.push(...c); else kids.push(c); }
              }
            }

            if (interestingOnly && !isInteresting) {
              return kids.length > 0 ? kids : null;
            }

            const node: any = {};
            if (role) node.role = role;
            node.tag = tag.toLowerCase();
            if (name && name.trim()) node.name = name.trim().slice(0, 80);
            if (tag === "A" && el.href) node.href = el.href;
            if (tag === "INPUT") { node.type = el.type; node.value = el.value; }
            if (el.id) node.id = el.id;
            if (el.className && typeof el.className === "string") {
              const cls = el.className.trim().slice(0, 60);
              if (cls) node.class = cls;
            }
            if (el.getAttribute && el.getAttribute("disabled") !== null && el.hasAttribute("disabled")) node.disabled = true;
            if (el.getAttribute && el.getAttribute("aria-expanded")) node.expanded = el.getAttribute("aria-expanded") === "true";
            const lvl = tag.match(/^H(\d)$/);
            if (lvl) node.level = parseInt(lvl[1]);
            if (kids.length > 0) node.children = kids;
            return node;
          }
          return walk((globalThis as any).document.body, maxDepth);
        }, { maxDepth: args.maxDepth, interestingOnly: args.interestingOnly });

        const text = JSON.stringify(tree, null, 2);
        if (text.length > 50000) {
          return { content: [{ type: "text", text: `Accessibility tree (truncated to 50k chars):\n${text.slice(0, 50000)}...` }] };
        }
        return { content: [{ type: "text", text: `Accessibility tree:\n${text}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_get_text",
    "Extract all visible text from the current page. Useful for understanding page content without screenshots. Returns text in reading order.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      selector: z.string().optional().describe("Optional CSS selector to limit text extraction to a specific element (e.g. 'main', '#content', 'article')"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const sel = args.selector || "body";
        const text = await session.page.locator(sel).first().innerText({ timeout: 5000 });
        const trimmed = text.length > 30000 ? text.slice(0, 30000) + "\n...(truncated)" : text;
        return { content: [{ type: "text", text: `Page text from "${sel}":\n\n${trimmed}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_get_html",
    "Get the HTML of the current page or a specific element. Useful for inspecting DOM structure, class names, and attributes.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      selector: z.string().optional().describe("Optional CSS selector (e.g. 'nav', '#header', 'form'). Omit for full page HTML."),
      outer: z.boolean().default(true).describe("If true, return outerHTML (includes the element itself). If false, return innerHTML (children only)."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        let html: string;
        if (args.selector) {
          const prop = args.outer ? "outerHTML" : "innerHTML";
          html = await session.page.locator(args.selector).first().evaluate((el, p) => (el as any)[p], prop);
        } else {
          html = await session.page.content();
        }
        const trimmed = html.length > 50000 ? html.slice(0, 50000) + "\n...(truncated)" : html;
        return { content: [{ type: "text", text: trimmed }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_hover",
    "Hover over an element on the page. Useful for triggering tooltips, dropdown menus, or hover states. Returns a screenshot after hovering.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      selector: z.string().describe("CSS selector of the element to hover over"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        await session.page.locator(args.selector).first().hover({ timeout: 5000 });
        await session.page.waitForTimeout(300);
        const img = await pageScreenshot(session.page);
        return { content: [{ type: "text", text: `Hovered: ${args.selector}` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error hovering: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_select_option",
    "Select an option from a <select> dropdown element. Returns a screenshot after selection.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      selector: z.string().describe("CSS selector of the <select> element"),
      value: z.string().describe("The value or visible text of the option to select"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        await session.page.locator(args.selector).first().selectOption(args.value, { timeout: 5000 });
        const img = await pageScreenshot(session.page);
        return { content: [{ type: "text", text: `Selected "${args.value}" in ${args.selector}` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error selecting option: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_go_back",
    "Navigate back in browser history (like clicking the Back button). Returns a screenshot of the previous page.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        await session.page.goBack({ waitUntil: "networkidle", timeout: 30000 });
        await session.page.waitForTimeout(1000);
        const img = await pageScreenshot(session.page);
        return { content: [{ type: "text", text: `Navigated back to: ${session.page.url()}` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error going back: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_go_forward",
    "Navigate forward in browser history. Returns a screenshot.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        await session.page.goForward({ waitUntil: "networkidle", timeout: 30000 });
        await session.page.waitForTimeout(1000);
        const img = await pageScreenshot(session.page);
        return { content: [{ type: "text", text: `Navigated forward to: ${session.page.url()}` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error going forward: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  // @ts-ignore - TS2589: MCP SDK generic inference too deep with multiple .default() fields
  server.tool(
    "browser_console_logs",
    "Get captured console logs (errors, warnings, logs) and JavaScript exceptions from the current browser session. Essential for debugging frontend issues.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      level: z.enum(["all", "error", "warning", "log", "exception"]).default("all").describe("Filter by log level"),
      limit: z.number().int().min(1).max(200).default(50).describe("Max number of log entries to return"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      let logs = session.consoleLogs;
      if (args.level !== "all") {
        logs = logs.filter((l) => l.level === args.level);
      }
      logs = logs.slice(-args.limit);
      if (logs.length === 0) return { content: [{ type: "text", text: "No console logs captured." }] };
      const text = logs.map((l) => `[${l.level.toUpperCase()}] ${l.text}`).join("\n");
      return { content: [{ type: "text", text: `Console logs (${logs.length} entries):\n\n${text}` }] };
    }
  );

  server.tool(
    "browser_network_errors",
    "Get failed network requests (4xx/5xx responses) captured during the browser session. Useful for identifying broken API calls, missing resources, and backend errors.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      limit: z.number().int().min(1).max(100).default(50).describe("Max number of errors to return"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      const errors = session.networkErrors.slice(-args.limit);
      if (errors.length === 0) return { content: [{ type: "text", text: "No failed network requests captured." }] };
      const text = errors.map((e) => `${e.status} ${e.statusText} — ${e.url}`).join("\n");
      return { content: [{ type: "text", text: `Failed network requests (${errors.length}):\n\n${text}` }] };
    }
  );

  server.tool(
    "browser_perf_metrics",
    "Get Core Web Vitals and performance metrics for the current page. Returns LCP, FCP, CLS, TTFB, DOM size, resource counts, and total transfer size. Essential for performance audits.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const metrics = await session.page.evaluate(() => {
          const perf = (globalThis as any).performance;
          const nav = perf.getEntriesByType("navigation")[0] as any;
          const paint = perf.getEntriesByType("paint");
          const lcp = perf.getEntriesByType("largest-contentful-paint");
          const cls = perf.getEntriesByType("layout-shift");
          const resources = perf.getEntriesByType("resource") as any[];

          const fcp = paint.find((e: any) => e.name === "first-contentful-paint");
          const clsScore = cls.reduce((sum: number, e: any) => sum + (e.hadRecentInput ? 0 : e.value), 0);

          const totalTransferSize = resources.reduce((sum: number, r: any) => sum + (r.transferSize || 0), 0);
          const resourcesByType: Record<string, number> = {};
          resources.forEach((r: any) => {
            const type = r.initiatorType || "other";
            resourcesByType[type] = (resourcesByType[type] || 0) + 1;
          });

          return {
            url: (globalThis as any).location.href,
            ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
            fcp: fcp ? Math.round(fcp.startTime) : null,
            lcp: lcp.length > 0 ? Math.round(lcp[lcp.length - 1].startTime) : null,
            cls: Math.round(clsScore * 1000) / 1000,
            domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
            loadComplete: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
            domNodes: (globalThis as any).document.querySelectorAll("*").length,
            resourceCount: resources.length,
            totalTransferKB: Math.round(totalTransferSize / 1024),
            resourcesByType,
          };
        });

        const lines = [
          `Performance Metrics for ${metrics.url}`,
          ``,
          `Core Web Vitals:`,
          `  TTFB:  ${metrics.ttfb !== null ? metrics.ttfb + "ms" : "N/A"}`,
          `  FCP:   ${metrics.fcp !== null ? metrics.fcp + "ms" : "N/A"}`,
          `  LCP:   ${metrics.lcp !== null ? metrics.lcp + "ms" : "N/A"}`,
          `  CLS:   ${metrics.cls}`,
          ``,
          `Page Load:`,
          `  DOM Content Loaded: ${metrics.domContentLoaded}ms`,
          `  Full Load: ${metrics.loadComplete}ms`,
          ``,
          `Page Size:`,
          `  DOM Nodes: ${metrics.domNodes}`,
          `  Resources: ${metrics.resourceCount}`,
          `  Transfer Size: ${metrics.totalTransferKB}KB`,
          ``,
          `Resources by Type:`,
          ...Object.entries(metrics.resourcesByType).map(([type, count]) => `  ${type}: ${count}`),
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_network_requests",
    "Get the full network request waterfall with timing data. Shows every request made by the page — URLs, methods, status codes, resource types, durations, and sizes. Use for performance analysis and debugging.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      resourceType: z.string().optional().describe("Filter by resource type: 'document', 'stylesheet', 'script', 'image', 'font', 'xhr', 'fetch'. Omit for all."),
      minDuration: z.number().default(0).describe("Only show requests slower than this (ms)"),
      limit: z.number().int().min(1).max(200).default(100).describe("Max number of requests to return"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      let reqs = session.networkRequests;
      if (args.resourceType) reqs = reqs.filter((r) => r.resourceType === args.resourceType);
      if (args.minDuration) reqs = reqs.filter((r) => r.duration >= args.minDuration);
      reqs = reqs.slice(-args.limit);
      if (reqs.length === 0) return { content: [{ type: "text", text: "No matching network requests captured." }] };

      const totalSize = reqs.reduce((sum, r) => sum + r.size, 0);
      const avgDuration = Math.round(reqs.reduce((sum, r) => sum + r.duration, 0) / reqs.length);
      const slowest = reqs.reduce((max, r) => r.duration > max.duration ? r : max, reqs[0]);

      const header = `Network Requests (${reqs.length} captured, ${Math.round(totalSize / 1024)}KB total, avg ${avgDuration}ms)\nSlowest: ${slowest.duration}ms — ${slowest.url.slice(0, 80)}\n`;
      const lines = reqs.map((r) => {
        const sizeStr = r.size > 0 ? `${Math.round(r.size / 1024)}KB` : "?";
        return `${r.status} ${r.method.padEnd(4)} ${r.duration.toString().padStart(5)}ms ${sizeStr.padStart(6)} [${r.resourceType}] ${r.url.slice(0, 100)}`;
      });
      return { content: [{ type: "text", text: header + lines.join("\n") }] };
    }
  );

  server.tool(
    "browser_seo_audit",
    "Extract SEO metadata from the current page: title, meta description, Open Graph tags, Twitter cards, canonical URL, heading hierarchy, structured data (JSON-LD), robots directives, and image alt text coverage.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const seo = await session.page.evaluate(() => {
          const doc = (globalThis as any).document;
          const getMeta = (name: string) => doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute("content") || null;
          const getAll = (sel: string) => Array.from(doc.querySelectorAll(sel));

          const headings: Record<string, string[]> = {};
          for (let i = 1; i <= 6; i++) {
            const els = getAll(`h${i}`);
            if (els.length > 0) headings[`h${i}`] = els.map((e: any) => e.textContent?.trim().slice(0, 80)).filter(Boolean);
          }

          const images = getAll("img");
          const imagesWithAlt = images.filter((img: any) => img.alt && img.alt.trim());
          const imagesWithoutAlt = images.filter((img: any) => !img.alt || !img.alt.trim()).map((img: any) => img.src?.slice(0, 100));

          const jsonLd = getAll('script[type="application/ld+json"]').map((s: any) => {
            try { return JSON.parse(s.textContent); } catch { return null; }
          }).filter(Boolean);

          const links = getAll("a[href]");
          const internalLinks = links.filter((a: any) => a.hostname === (globalThis as any).location.hostname).length;
          const externalLinks = links.length - internalLinks;

          return {
            url: (globalThis as any).location.href,
            title: doc.title || null,
            titleLength: (doc.title || "").length,
            metaDescription: getMeta("description"),
            metaDescriptionLength: (getMeta("description") || "").length,
            canonical: doc.querySelector('link[rel="canonical"]')?.href || null,
            robots: getMeta("robots"),
            og: {
              title: getMeta("og:title"),
              description: getMeta("og:description"),
              image: getMeta("og:image"),
              type: getMeta("og:type"),
              url: getMeta("og:url"),
              siteName: getMeta("og:site_name"),
            },
            twitter: {
              card: getMeta("twitter:card"),
              title: getMeta("twitter:title"),
              description: getMeta("twitter:description"),
              image: getMeta("twitter:image"),
            },
            headings,
            images: { total: images.length, withAlt: imagesWithAlt.length, missingAlt: imagesWithoutAlt.slice(0, 10) },
            links: { total: links.length, internal: internalLinks, external: externalLinks },
            jsonLd: jsonLd.length > 0 ? jsonLd : null,
            lang: doc.documentElement?.lang || null,
            viewport: getMeta("viewport"),
          };
        });

        const lines = [
          `SEO Audit: ${seo.url}`,
          ``,
          `Title: ${seo.title || "MISSING"} (${seo.titleLength} chars${seo.titleLength > 60 ? " ⚠️ too long" : seo.titleLength < 30 ? " ⚠️ too short" : " ✓"})`,
          `Description: ${seo.metaDescription?.slice(0, 100) || "MISSING"} (${seo.metaDescriptionLength} chars${seo.metaDescriptionLength > 160 ? " ⚠️ too long" : seo.metaDescriptionLength < 50 ? " ⚠️ too short" : " ✓"})`,
          `Canonical: ${seo.canonical || "MISSING"}`,
          `Robots: ${seo.robots || "not set"}`,
          `Language: ${seo.lang || "MISSING"}`,
          `Viewport: ${seo.viewport || "MISSING"}`,
          ``,
          `Open Graph:`,
          ...Object.entries(seo.og).map(([k, v]) => `  og:${k}: ${v || "missing"}`),
          ``,
          `Twitter Card:`,
          ...Object.entries(seo.twitter).map(([k, v]) => `  twitter:${k}: ${v || "missing"}`),
          ``,
          `Headings:`,
          ...Object.entries(seo.headings).map(([level, texts]) => `  ${level}: ${(texts as string[]).length} — ${(texts as string[]).slice(0, 3).join(", ")}`),
          ``,
          `Images: ${seo.images.total} total, ${seo.images.withAlt} with alt text${seo.images.total > 0 ? ` (${Math.round(seo.images.withAlt / seo.images.total * 100)}% coverage)` : ""}`,
          ...(seo.images.missingAlt.length > 0 ? [`  Missing alt: ${seo.images.missingAlt.join(", ")}`] : []),
          ``,
          `Links: ${seo.links.total} total (${seo.links.internal} internal, ${seo.links.external} external)`,
          ...(seo.jsonLd ? [`\nStructured Data (JSON-LD): ${JSON.stringify(seo.jsonLd).slice(0, 500)}`] : []),
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "browser_press_key",
    "Press a keyboard key or key combination. Supports special keys like Enter, Tab, Escape, ArrowDown, and modifiers like Control+A, Shift+Tab. Returns a screenshot after pressing.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      key: z.string().describe("Key to press (e.g. 'Enter', 'Tab', 'Escape', 'ArrowDown', 'Control+a', 'Meta+c')"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        await session.page.keyboard.press(args.key);
        await session.page.waitForTimeout(300);
        const img = await pageScreenshot(session.page);
        return { content: [{ type: "text", text: `Pressed key: ${args.key}` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  // @ts-ignore - TS2589: MCP SDK generic inference too deep with nested z.object/z.array
  server.tool(
    "browser_cookies",
    "Get or set cookies for the current browser session. Use 'get' to read all cookies (useful for debugging auth). Use 'set' to add cookies (useful for setting auth tokens). Use 'clear' to delete all cookies.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      action: z.enum(["get", "set", "clear"]).describe("Action to perform"),
      cookies: z.array(z.object({
        name: z.string().describe("Cookie name"),
        value: z.string().describe("Cookie value"),
        domain: z.string().optional().describe("Cookie domain"),
        path: z.string().default("/").describe("Cookie path"),
        httpOnly: z.boolean().default(false),
        secure: z.boolean().default(false),
      })).optional().describe("Cookies to set (only for 'set' action)"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        if (args.action === "get") {
          const cookies = await session.context.cookies();
          if (cookies.length === 0) return { content: [{ type: "text", text: "No cookies set." }] };
          const text = cookies.map((c) => `${c.name}=${c.value.slice(0, 50)}${c.value.length > 50 ? "..." : ""} (domain: ${c.domain}, path: ${c.path}${c.httpOnly ? ", httpOnly" : ""}${c.secure ? ", secure" : ""})`).join("\n");
          return { content: [{ type: "text", text: `Cookies (${cookies.length}):\n\n${text}` }] };
        } else if (args.action === "set" && args.cookies) {
          const url = session.page.url();
          const domain = new URL(url).hostname;
          const toSet = args.cookies.map((c) => ({ ...c, domain: c.domain || domain }));
          await session.context.addCookies(toSet);
          return { content: [{ type: "text", text: `Set ${toSet.length} cookie(s). Reload the page for them to take effect.` }] };
        } else if (args.action === "clear") {
          await session.context.clearCookies();
          return { content: [{ type: "text", text: "All cookies cleared." }] };
        }
        return { content: [{ type: "text", text: "Invalid action. Use 'get', 'set', or 'clear'." }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  // @ts-ignore - TS2589: MCP SDK generic inference too deep with multiple .default() fields
  server.tool(
    "browser_storage",
    "Read or write localStorage and sessionStorage. Use for debugging client-side state, auth tokens, feature flags, and cached data.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      storageType: z.enum(["localStorage", "sessionStorage"]).default("localStorage").describe("Which storage to access"),
      action: z.enum(["get", "getAll", "set", "remove", "clear"]).describe("Action: get one key, getAll keys, set a key, remove a key, or clear all"),
      key: z.string().optional().describe("Storage key (required for get, set, remove)"),
      value: z.string().optional().describe("Value to set (required for 'set' action)"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const st = args.storageType;
        if (args.action === "getAll") {
          const data = await session.page.evaluate((type: string) => {
            const s = type === "localStorage" ? (globalThis as any).localStorage : (globalThis as any).sessionStorage;
            const result: Record<string, string> = {};
            for (let i = 0; i < s.length; i++) {
              const key = s.key(i);
              result[key] = s.getItem(key)?.slice(0, 200) || "";
            }
            return result;
          }, st);
          const entries = Object.entries(data);
          if (entries.length === 0) return { content: [{ type: "text", text: `${st} is empty.` }] };
          const text = entries.map(([k, v]) => `${k}: ${v}`).join("\n");
          return { content: [{ type: "text", text: `${st} (${entries.length} keys):\n\n${text}` }] };
        } else if (args.action === "get" && args.key) {
          const val = await session.page.evaluate(({ type, key }: any) => {
            const s = type === "localStorage" ? (globalThis as any).localStorage : (globalThis as any).sessionStorage;
            return s.getItem(key);
          }, { type: st, key: args.key });
          return { content: [{ type: "text", text: val !== null ? `${args.key}: ${val}` : `Key "${args.key}" not found in ${st}.` }] };
        } else if (args.action === "set" && args.key && args.value !== undefined) {
          await session.page.evaluate(({ type, key, value }: any) => {
            const s = type === "localStorage" ? (globalThis as any).localStorage : (globalThis as any).sessionStorage;
            s.setItem(key, value);
          }, { type: st, key: args.key, value: args.value });
          return { content: [{ type: "text", text: `Set ${st}.${args.key}` }] };
        } else if (args.action === "remove" && args.key) {
          await session.page.evaluate(({ type, key }: any) => {
            const s = type === "localStorage" ? (globalThis as any).localStorage : (globalThis as any).sessionStorage;
            s.removeItem(key);
          }, { type: st, key: args.key });
          return { content: [{ type: "text", text: `Removed ${st}.${args.key}` }] };
        } else if (args.action === "clear") {
          await session.page.evaluate((type: string) => {
            const s = type === "localStorage" ? (globalThis as any).localStorage : (globalThis as any).sessionStorage;
            s.clear();
          }, st);
          return { content: [{ type: "text", text: `Cleared all ${st}.` }] };
        }
        return { content: [{ type: "text", text: "Invalid action or missing parameters." }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  // ── Smart Login Tools ──────────────────────────────────────────────

  server.tool(
    "find_login_page",
    "Discover login/sign-in pages for a website. Checks the site's sitemap.xml and probes common login URL paths. Returns a list of candidate login URLs found. Use this before attempting to log in to a site.",
    {
      url: z.string().url().describe("Base URL of the site to find login pages for (e.g. https://myapp.com)"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: auth.error }] };

      const base = args.url.replace(/\/+$/, "");
      const found: { url: string; source: string; status: number }[] = [];

      // 1. Check sitemap.xml for login/auth/signin pages
      const sitemapUrls = [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`];
      for (const sitemapUrl of sitemapUrls) {
        try {
          const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            const xml = await res.text();
            const locMatches = xml.match(/<loc>(.*?)<\/loc>/gi) || [];
            for (const loc of locMatches) {
              const href = loc.replace(/<\/?loc>/gi, "").trim();
              if (/\b(login|signin|sign-in|sign_in|auth|account|sso|log-in)\b/i.test(href)) {
                found.push({ url: href, source: "sitemap", status: 200 });
              }
            }
          }
        } catch { /* timeout or fetch error — skip */ }
      }

      // 2. Probe common login paths
      const commonPaths = [
        "/login", "/signin", "/sign-in", "/auth/login", "/auth/signin",
        "/account/login", "/account/signin", "/user/login", "/users/sign_in",
        "/admin/login", "/admin", "/wp-login.php", "/wp-admin",
        "/dashboard/login", "/portal/login", "/sso/login",
        "/auth", "/session/new", "/log-in", "/member/login",
      ];

      const probes = commonPaths.map(async (path) => {
        const probeUrl = `${base}${path}`;
        try {
          const res = await fetch(probeUrl, {
            method: "HEAD",
            redirect: "follow",
            signal: AbortSignal.timeout(4000),
          });
          if (res.ok || res.status === 401 || res.status === 403) {
            found.push({ url: probeUrl, source: "common-path", status: res.status });
          }
        } catch { /* skip timeouts and errors */ }
      });
      await Promise.all(probes);

      // 3. Deduplicate by URL
      const unique = [...new Map(found.map((f) => [f.url, f])).values()];

      if (unique.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No login pages found for ${base}.\n\nTried:\n- Sitemap: ${sitemapUrls.join(", ")}\n- Common paths: ${commonPaths.length} probed\n\nAsk the user for the exact login URL.`,
          }],
        };
      }

      const list = unique.map((f) => `- ${f.url} (found via ${f.source}, HTTP ${f.status})`).join("\n");
      return {
        content: [{
          type: "text",
          text: `Found ${unique.length} login page candidate(s) for ${base}:\n\n${list}\n\nNext steps:\n1. Navigate to the best candidate with browser_navigate\n2. Ask the user for their username/email and password\n3. Use browser_fill and browser_click to log in\n4. Take a browser_screenshot to verify login success`,
        }],
      };
    }
  );

  server.tool(
    "smart_login",
    "Attempt to log in to a website. Navigates to the login URL, finds email/username and password fields, fills them in, and submits the form. Returns a screenshot and reports whether login succeeded or failed. Always ask the user for credentials first — never guess.",
    {
      loginUrl: z.string().url().describe("The login page URL to navigate to"),
      username: z.string().describe("The username or email to enter"),
      password: z.string().describe("The password to enter"),
      usernameSelector: z.string().optional().describe("CSS selector for username field. Auto-detected if omitted."),
      passwordSelector: z.string().optional().describe("CSS selector for password field. Auto-detected if omitted."),
      submitSelector: z.string().optional().describe("CSS selector for submit button. Auto-detected if omitted."),
    },
    async (args) => {
      const authResult = await validateKey(apiKey);
      if (!authResult.ok) return { content: [{ type: "text", text: authResult.error }] };

      try {
        // Create a new session and navigate
        const sessionId = await createSession(authResult.userId);
        const session = await getSession(sessionId, authResult.userId);
        if (!session) return { content: [{ type: "text", text: "Failed to create browser session." }] };
        const page = session.page;

        await navigateWithRetry(page, args.loginUrl);

        // Auto-detect username/email field
        const usernameSelector = args.usernameSelector || await page.evaluate(`
          (() => {
            const sels = [
              'input[type="email"]', 'input[name="email"]', 'input[name="username"]',
              'input[name="user"]', 'input[name="login"]', 'input[id="email"]',
              'input[id="username"]', 'input[id="login-email"]',
              'input[type="text"][autocomplete="username"]',
              'input[type="text"][autocomplete="email"]', 'input[type="text"]',
            ];
            for (const s of sels) {
              const el = document.querySelector(s);
              if (el && el.offsetParent !== null) return s;
            }
            return null;
          })()
        `);

        // Auto-detect password field
        const passwordSelector = args.passwordSelector || await page.evaluate(`
          (() => {
            const sels = ['input[type="password"]', 'input[name="password"]', 'input[id="password"]'];
            for (const s of sels) {
              const el = document.querySelector(s);
              if (el && el.offsetParent !== null) return s;
            }
            return null;
          })()
        `);

        if (!usernameSelector || !passwordSelector) {
          const img = await pageScreenshot(page);
          const missing = [];
          if (!usernameSelector) missing.push("username/email field");
          if (!passwordSelector) missing.push("password field");
          return {
            content: [
              { type: "text", text: `Login failed: Could not auto-detect ${missing.join(" and ")}.\n\nThe page may use a multi-step login or non-standard form. Please provide CSS selectors via usernameSelector and passwordSelector parameters, or use browser_fill manually.\n\nSession ID: ${sessionId}` },
              img,
            ],
          };
        }

        // Fill in credentials
        await page.click(usernameSelector as string);
        await page.fill(usernameSelector as string, args.username);
        await page.waitForTimeout(300);

        await page.click(passwordSelector as string);
        await page.fill(passwordSelector as string, args.password);
        await page.waitForTimeout(300);

        // Find and click submit
        const submitSelector = args.submitSelector || await page.evaluate(`
          (() => {
            const sels = [
              'button[type="submit"]', 'input[type="submit"]', 'form button',
            ];
            for (const s of sels) {
              try {
                const el = document.querySelector(s);
                if (el && el.offsetParent !== null) return s;
              } catch {}
            }
            return null;
          })()
        `);

        if (submitSelector) {
          try {
            await page.click(submitSelector as string);
          } catch {
            await page.keyboard.press("Enter");
          }
        } else {
          await page.keyboard.press("Enter");
        }

        // Wait for navigation / response
        await page.waitForTimeout(3000);

        // Check for login success indicators
        const currentUrl = page.url();
        const loginFailed = await page.evaluate(`
          (() => {
            const body = (document.body && document.body.innerText || "").toLowerCase();
            const patterns = [
              "invalid password", "incorrect password", "wrong password",
              "invalid credentials", "invalid email", "login failed",
              "authentication failed", "account not found", "user not found",
              "please try again", "error signing in", "unable to sign in",
              "invalid username", "incorrect email",
            ];
            return patterns.some(p => body.includes(p));
          })()
        `);

        const stillOnLogin = /\b(login|signin|sign-in|sign_in|auth|log-in)\b/i.test(currentUrl);

        const img = await pageScreenshot(page);

        if (loginFailed) {
          return {
            content: [
              { type: "text", text: `Login FAILED at ${currentUrl}\n\nThe page shows an error message indicating invalid credentials.\n\nSession ID: ${sessionId} (session kept open for retry)\n\nOptions:\n1. Ask the user to double-check their credentials\n2. Ask for the exact login URL if this was the wrong page\n3. Use browser_fill manually if the form is non-standard` },
              img,
            ],
          };
        }

        if (stillOnLogin && currentUrl === args.loginUrl) {
          return {
            content: [
              { type: "text", text: `Login UNCERTAIN — still on ${currentUrl}\n\nThe page didn't navigate away after submission. This could mean:\n- Credentials were wrong but no visible error\n- The form requires additional steps (2FA, captcha)\n- The submit button wasn't clicked correctly\n\nSession ID: ${sessionId} (session kept open)\n\nCheck the screenshot and use browser tools to continue.` },
              img,
            ],
          };
        }

        return {
          content: [
            { type: "text", text: `Login SUCCESS! Redirected to: ${currentUrl}\n\nSession ID: ${sessionId}\n\nYou can now use this session to continue testing the authenticated flow. Use browser_click, browser_fill, browser_navigate, etc. with this session ID.\n\nRemember to call browser_close when done.` },
            img,
          ],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Login error: ${err instanceof Error ? err.message : String(err)}\n\nThe page may have timed out or the URL may be incorrect. Ask the user for the exact login URL.` }] };
      }
    }
  );

  // ── Standalone Accessibility Snapshot ───────────────────────────────

  // @ts-ignore - TS2589: MCP SDK generic inference too deep with multiple .default() fields
  server.tool(
    "accessibility_snapshot",
    "Get the accessibility tree for any URL without needing a browser session. Returns a structured snapshot of all interactive elements, headings, links, buttons, form fields, images with alt text, and ARIA roles. Great for quick UX audits.",
    {
      url: z.string().url().describe("URL to get the accessibility tree for"),
      maxDepth: z.number().int().min(1).max(20).default(8).describe("Maximum depth of the tree to return"),
      interestingOnly: z.boolean().default(true).describe("If true, only return interesting UX nodes (buttons, links, inputs, headings, images). Set false for the full tree."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };

      const { browser, release } = await browserPool.acquire();
      let context;
      try {
        context = await browser.newContext({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          viewport: { width: 1280, height: 800 },
          locale: "en-US",
        });
        const page = await context.newPage();
        try {
          await page.goto(args.url, { waitUntil: "networkidle", timeout: 30000 });
        } catch {
          await page.goto(args.url, { waitUntil: "load", timeout: 30000 });
        }
        await page.waitForTimeout(1500);

        const tree = await page.evaluate(({ maxDepth, interestingOnly }: any) => {
          const IR = new Set(["button","link","textbox","checkbox","radio","combobox","listbox","menuitem","tab","heading","img","navigation","main","banner","contentinfo","search","form","dialog","alert","progressbar","slider"]);
          const IT: any = {A:"link",BUTTON:"button",INPUT:"textbox",TEXTAREA:"textbox",SELECT:"combobox",IMG:"img",NAV:"navigation",MAIN:"main",HEADER:"banner",FOOTER:"contentinfo",FORM:"form",DIALOG:"dialog",H1:"heading",H2:"heading",H3:"heading",H4:"heading",H5:"heading",H6:"heading"};
          const ITAGS = ["A","BUTTON","INPUT","TEXTAREA","SELECT","IMG","NAV","MAIN","HEADER","FOOTER","FORM","H1","H2","H3","H4","H5","H6"];

          function walk(el: any, depth: number): any {
            if (!el || depth <= 0) return null;
            const tag = el.tagName || "";
            const role = (el.getAttribute && el.getAttribute("role")) || IT[tag] || "";
            const name = (el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("title") || el.getAttribute("placeholder"))) || (el.innerText ? el.innerText.slice(0, 80) : "") || "";
            const isInteresting = IR.has(role) || (el.getAttribute && el.getAttribute("role")) || ITAGS.includes(tag);

            const kids: any[] = [];
            if (el.children) {
              for (let i = 0; i < el.children.length; i++) {
                const c = walk(el.children[i], depth - 1);
                if (c) { if (Array.isArray(c)) kids.push(...c); else kids.push(c); }
              }
            }

            if (interestingOnly && !isInteresting) {
              return kids.length > 0 ? kids : null;
            }

            const node: any = {};
            if (role) node.role = role;
            node.tag = tag.toLowerCase();
            if (name && name.trim()) node.name = name.trim().slice(0, 80);
            if (tag === "A" && el.href) node.href = el.href;
            if (tag === "INPUT") { node.type = el.type; node.value = el.value; }
            if (el.id) node.id = el.id;
            if (el.className && typeof el.className === "string") {
              const cls = el.className.trim().slice(0, 60);
              if (cls) node.class = cls;
            }
            if (el.getAttribute && el.getAttribute("disabled") !== null && el.hasAttribute("disabled")) node.disabled = true;
            if (el.getAttribute && el.getAttribute("aria-expanded")) node.expanded = el.getAttribute("aria-expanded") === "true";
            const lvl = tag.match(/^H(\d)$/);
            if (lvl) node.level = parseInt(lvl[1]);
            if (kids.length > 0) node.children = kids;
            return node;
          }
          return walk((globalThis as any).document.body, maxDepth);
        }, { maxDepth: args.maxDepth, interestingOnly: args.interestingOnly });

        const text = JSON.stringify(tree, null, 2);
        if (text.length > 50000) {
          return { content: [{ type: "text", text: `Accessibility tree for ${args.url} (truncated to 50k chars):\n${text.slice(0, 50000)}...` }] };
        }
        return { content: [{ type: "text", text: `Accessibility tree for ${args.url}:\n${text}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      } finally {
        if (context) await context.close().catch(() => {});
        await release();
      }
    }
  );

  return server;
}

function resolveKey(req: Request): string | undefined {
  return (
    (req.headers["x-api-key"] as string | undefined) ||
    (req.params.key as string | undefined) ||
    (req.query.key as string | undefined)
  );
}

async function handleMcp(req: Request, res: Response, body: unknown) {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const apiKey = resolveKey(req);
  const server = createMcpServer(apiKey);
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req as never, res as never, body);
}

mcpRouter.post("/", (req, res) => handleMcp(req, res, req.body));
mcpRouter.get("/", (req, res) => handleMcp(req, res, {}));
mcpRouter.post("/:key", (req, res) => handleMcp(req, res, req.body));
mcpRouter.get("/:key", (req, res) => handleMcp(req, res, {}));
