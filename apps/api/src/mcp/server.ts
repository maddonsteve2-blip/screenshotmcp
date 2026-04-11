import { Router, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { screenshots, apiKeys, users, usageEvents, testInboxes } from "@screenshotsmcp/db";
import { screenshotQueue } from "../lib/queue.js";
import { createHash } from "crypto";
import { eq, and, count, gte, desc } from "drizzle-orm";
import { PLAN_LIMITS } from "@screenshotsmcp/types";
import { createSession, getSession, closeSession, pageScreenshot, navigateWithRetry, setSessionViewport } from "../lib/sessions.js";
import { browserPool } from "../lib/browser-pool.js";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import OpenAI from "openai";
import { uploadScreenshot } from "../lib/r2.js";
import { AgentMailClient } from "agentmail";

export const mcpRouter = Router();

type AuthResult =
  | { ok: true; userId: string; plan: "free" | "starter" | "pro"; agentmailApiKey?: string | null }
  | { ok: false; error: string };

async function validateKey(apiKey: string | undefined): Promise<AuthResult> {
  if (!apiKey) return { ok: false, error: "API key required. Pass sk_live_... as x-api-key header." };
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const [row] = await db
    .select({ userId: apiKeys.userId, plan: users.plan, agentmailApiKey: users.agentmailApiKey })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.revoked, false)));
  if (!row) return { ok: false, error: "Invalid or revoked API key." };
  return { ok: true, userId: row.userId, plan: (row.plan ?? "free") as "free" | "starter" | "pro", agentmailApiKey: row.agentmailApiKey };
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

function humanizeError(msg: string): string {
  if (msg.includes("ERR_NAME_NOT_RESOLVED")) return "DNS resolution failed — the domain does not exist or is unreachable.";
  if (msg.includes("ERR_CERT_DATE_INVALID")) return "SSL certificate has expired for this site.";
  if (msg.includes("ERR_CERT_AUTHORITY_INVALID")) return "SSL certificate is self-signed or from an untrusted authority.";
  if (msg.includes("ERR_CONNECTION_REFUSED")) return "Connection refused — the server is not accepting connections.";
  if (msg.includes("ERR_CONNECTION_TIMED_OUT")) return "Connection timed out — the server took too long to respond.";
  if (msg.includes("ERR_CERT_COMMON_NAME_INVALID")) return "SSL certificate does not match the domain name.";
  // Strip Playwright 'Call log:' noise
  const callLogIdx = msg.indexOf("Call log:");
  if (callLogIdx > 0) return msg.slice(0, callLogIdx).trim();
  // Strip 'page.goto: ' prefix
  return msg.replace(/^page\.goto:\s*/i, "").replace(/^locator\.\w+:\s*/i, "");
}

async function pollScreenshot(id: string) {
  const startTime = Date.now();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const [row] = await db.select().from(screenshots).where(eq(screenshots.id, id));
    if (row?.status === "done" && row.publicUrl) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const isPdf = row.publicUrl.endsWith(".pdf");
      const sizeStr = isPdf ? "PDF document" : `${row.width ?? "?"}×${row.height ?? "?"} ${(row.format ?? "png").toUpperCase()}`;
      return {
        content: [
          { type: "text" as const, text: `Screenshot ready!\nURL: ${row.publicUrl}\nSize: ${sizeStr}\nCaptured in: ${elapsed}s` },
        ],
      };
    }
    if (row?.status === "failed") {
      return { content: [{ type: "text" as const, text: `Screenshot failed: ${humanizeError(row.errorMessage ?? "Unknown error")}` }] };
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

**Interaction:** browser_click, browser_click_at (coordinate-based for CAPTCHAs), browser_fill, browser_hover, browser_select_option, browser_scroll, browser_press_key
**CAPTCHA:** solve_captcha — auto-detect and solve Cloudflare Turnstile, reCAPTCHA, hCaptcha using AI (CapSolver)
**Navigation:** browser_navigate (supports width/height params), browser_go_back, browser_go_forward, browser_wait_for
**Viewport:** browser_set_viewport — resize the browser viewport mid-session (e.g. switch between desktop and mobile)
**Inspection:** browser_screenshot, browser_get_text, browser_get_html, browser_get_accessibility_tree, browser_evaluate
**Standalone:** accessibility_snapshot — get accessibility tree for any URL without a session

## Session Recording (Video)
Record a full video of any browser session:
1. Start with **browser_navigate** and set **record_video: true** — a recording indicator appears.
2. Perform your workflow (click, fill, scroll, etc.) — everything is captured as a .webm video.
3. Call **browser_close** — the video is uploaded and the **public URL** is returned.

Use recording when:
- The user asks to "record", "film", "show me what happened", or "replay"
- Testing sign-up / login flows (proof of work)
- UX audits where the user wants to see transitions and animations
- Bug reports that benefit from video evidence

The video URL is permanent and shareable. Recording adds minimal overhead to the session.
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
- When the user says "audit this site" or "check UX", use browser_navigate + browser_get_accessibility_tree + browser_console_logs.

## Disposable Email Tools (AgentMail)
For testing sign-up flows, reading verification codes, etc:
- **create_test_inbox** — creates or **reuses** a saved inbox. Returns email + generated password. Saved to dashboard.
- **check_inbox** — read messages, auto-extracts OTP codes and verification links
- **send_test_email** — send email from an inbox
Each user needs their own AgentMail API key (free at https://console.agentmail.to). Configure in Dashboard → Settings.

**IMPORTANT — Inbox & Password Rules:**
- create_test_inbox returns a **unique generated password** with each new inbox. ALWAYS use this password — never invent your own (they may trigger breach detection).
- Existing inboxes are **automatically reused** across sessions. Only use force_new: true when you specifically need a fresh registration.
- The email + password are saved in **Dashboard → Settings → Test Inboxes** for the user to see and copy.

## Sign-Up Testing Flow
1. **create_test_inbox** → get email + generated password (or reuse existing)
2. **browser_navigate** to sign-up page
3. **browser_fill** email + the password from step 1
4. **solve_captcha** if CAPTCHA present
5. **browser_click** submit
6. **check_inbox** → extract OTP code
7. **browser_fill** the OTP → verify → done

## Agent Skill
For detailed workflows, best practices, and full tool reference, install the ScreenshotsMCP agent skill:
\`\`\`
curl -o .skills/screenshotsmcp/SKILL.md --create-dirs https://screenshotsmcp.com/.skills/screenshotsmcp/SKILL.md
\`\`\`
Or fetch: https://screenshotsmcp.com/.skills/screenshotsmcp/SKILL.md`,
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
    "Capture a screenshot at iPhone 14 Pro viewport (393×852). By default captures viewport-only (not the full scrollable page). Set fullPage to true for full-page capture. Returns device name, dimensions, and public image URL.",
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
      const result = await pollScreenshot(id);
      const txt = result.content.find((c: any) => c.type === "text") as any;
      if (txt) txt.text = `Device: iPhone 14 Pro (393×852)\n${txt.text}`;
      return result;
    }
  );

  server.tool(
    "screenshot_tablet",
    "Capture a screenshot at iPad viewport (820×1180). By default captures viewport-only (not the full scrollable page). Set fullPage to true for full-page capture. Returns device name, dimensions, and public image URL.",
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
      const result = await pollScreenshot(id);
      const txt = result.content.find((c: any) => c.type === "text") as any;
      if (txt) txt.text = `Device: iPad (820×1180)\n${txt.text}`;
      return result;
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
      const result = await pollScreenshot(id);
      const txt = result.content.find((c: any) => c.type === "text") as any;
      if (txt) txt.text = `Dark mode: enabled\n${txt.text}`;
      return result;
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
      const list = rows.map((r, i) => {
        const isPdf = r.publicUrl?.endsWith(".pdf");
        const sizeStr = isPdf ? "PDF document" : `${r.width ?? "?"}×${r.height ?? "?"} ${(r.format ?? "png").toUpperCase()}`;
        return `${i + 1}. ${r.url}\n   Image: ${r.publicUrl}\n   Size: ${sizeStr}\n   Taken: ${new Date(r.createdAt).toLocaleString()}`;
      }).join("\n\n");
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
      if (!row) return { content: [{ type: "text", text: "Screenshot not found. The ID may be wrong or it may belong to a different API key." }] };
      if (row.status === "done" && row.publicUrl) {
        const isPdf = row.publicUrl.endsWith(".pdf");
        const sizeStr = isPdf ? "PDF document" : `${row.width ?? "?"}×${row.height ?? "?"} ${(row.format ?? "png").toUpperCase()}`;
        return { content: [{ type: "text", text: `Status: done\nURL: ${row.publicUrl}\nSize: ${sizeStr}\nOriginal URL: ${row.url}\nCreated: ${new Date(row.createdAt).toLocaleString()}` }] };
      }
      return { content: [{ type: "text", text: `Status: ${row.status}${row.errorMessage ? `\nError: ${humanizeError(row.errorMessage)}` : ""}` }] };
    }
  );

  server.tool(
    "browser_navigate",
    "Open a browser and navigate to a URL. Returns a screenshot of the loaded page. Use this to start a browser session — the returned sessionId must be passed to all subsequent browser_ tools. Pass width/height to start with a custom viewport (e.g. 393×852 for mobile). Set record_video to true to record the entire session as a video — the recording URL is returned when browser_close is called.",
    {
      url: z.string().url().describe("URL to navigate to"),
      sessionId: z.string().optional().describe("Existing session ID to reuse. Omit to start a new browser session."),
      width: z.number().int().min(320).max(3840).optional().describe("Viewport width for new sessions (default 1280). Ignored if sessionId is provided."),
      height: z.number().int().min(240).max(2160).optional().describe("Viewport height for new sessions (default 800). Ignored if sessionId is provided."),
      record_video: z.boolean().optional().default(false).describe("Record a video of the entire browser session. The .webm recording URL is returned when you call browser_close. Only applies to new sessions."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      try {
        let sessionId = args.sessionId;
        let page;
        let isRecording = false;
        if (sessionId) {
          const session = await getSession(sessionId, auth.userId);
          if (!session) return { content: [{ type: "text", text: `Error: Session ${sessionId} not found or expired. Start a new one by omitting sessionId.` }] };
          page = session.page;
          isRecording = session.recording;
        } else {
          const vp = (args.width || args.height) ? { width: args.width || 1280, height: args.height || 800 } : undefined;
          sessionId = await createSession(auth.userId, vp, args.record_video);
          const session = await getSession(sessionId, auth.userId);
          page = session!.page;
          isRecording = session!.recording;
        }
        await navigateWithRetry(page, args.url);
        const img = await pageScreenshot(page);
        const vpSize = page.viewportSize();
        const recordingNote = isRecording ? "\n🔴 Recording session — call browser_close to get the video URL" : "";
        return { content: [{ type: "text", text: `Navigated to ${args.url}\nSession ID: ${sessionId}\nViewport: ${vpSize?.width}×${vpSize?.height}\n(Pass this sessionId to all browser_ tools)${recordingNote}` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error navigating: ${humanizeError(err instanceof Error ? err.message : String(err))}` }] };
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
        const raw = err instanceof Error ? err.message : String(err);
        const friendly = raw.includes("Timeout") ? `Could not find element "${args.selector}" within 5 seconds. Check that the selector is correct and the element is visible.` : humanizeError(raw);
        return { content: [{ type: "text", text: `Error clicking: ${friendly}` }] };
      }
    }
  );

  server.tool(
    "browser_click_at",
    "Click at specific x,y coordinates on the current browser page. Use this when elements cannot be targeted by CSS selector — such as CAPTCHA checkboxes, canvas elements, iframes, or Cloudflare Turnstile widgets. Returns a screenshot after clicking.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      x: z.number().describe("X coordinate (pixels from left edge of viewport)"),
      y: z.number().describe("Y coordinate (pixels from top edge of viewport)"),
      clickCount: z.number().optional().default(1).describe("Number of clicks (default: 1, use 2 for double-click)"),
      delay: z.number().optional().default(0).describe("Delay in ms between mousedown and mouseup (simulates human-like click)"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const page = session.page;
        // Move mouse smoothly to target (more human-like)
        await page.mouse.move(args.x, args.y, { steps: 5 });
        await page.mouse.click(args.x, args.y, {
          clickCount: args.clickCount || 1,
          delay: args.delay || 50,
        });
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(500);
        const img = await pageScreenshot(page);
        return { content: [{ type: "text", text: `Clicked at coordinates (${args.x}, ${args.y})` }, img] };
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error clicking at coordinates: ${humanizeError(raw)}` }] };
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
        const raw = err instanceof Error ? err.message : String(err);
        const friendly = raw.includes("Timeout") ? `Could not find input "${args.selector}" within 5 seconds. Check that the selector is correct.` : humanizeError(raw);
        return { content: [{ type: "text", text: `Error filling field: ${friendly}` }] };
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
          { type: "text", text: `Element "${args.selector}" not found within ${args.timeout}ms. The element may not exist, may be hidden, or the page may still be loading. Try increasing the timeout or checking the selector.` },
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
        const formatted = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return { content: [{ type: "text", text: `Result: ${formatted}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  // @ts-ignore - TS2589: MCP SDK generic inference too deep
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
    "Close the browser session and free all resources. Always call this when the browser workflow is complete. If the session was started with record_video: true, the video recording URL is returned.",
    {
      sessionId: z.string().describe("Session ID to close"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const result = await closeSession(args.sessionId);
      if (result.videoUrl) {
        return { content: [{ type: "text", text: `Session ${args.sessionId} closed.\n\n🎬 **Session Recording:** ${result.videoUrl}\n\nThis .webm video shows everything that happened during the browser session. Share it with users or use it for debugging.` }] };
      }
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

          const SKIP = new Set(["SCRIPT","STYLE","NOSCRIPT","SVG","LINK","META"]);
          function walk(el: any, depth: number): any {
            if (!el || depth <= 0) return null;
            const tag = el.tagName || "";
            if (SKIP.has(tag)) return null;
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
        const nodeCount = (text.match(/"role"/g) || []).length;
        if (text.length > 50000) {
          return { content: [{ type: "text", text: `Accessibility tree (~${nodeCount} nodes, truncated to 50k chars):\n${text.slice(0, 50000)}...` }] };
        }
        return { content: [{ type: "text", text: `Accessibility tree (~${nodeCount} nodes):\n${text}` }] };
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
        const source = args.selector || "full page";
        if (args.selector) {
          const prop = args.outer ? "outerHTML" : "innerHTML";
          html = await session.page.locator(args.selector).first().evaluate((el, p) => (el as any)[p], prop);
        } else {
          html = await session.page.content();
        }
        const trimmed = html.length > 50000 ? html.slice(0, 50000) + "\n...(truncated)" : html;
        return { content: [{ type: "text", text: `HTML from ${source} (${html.length} chars${html.length > 50000 ? ", truncated" : ""}):\n\n${trimmed}` }] };
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
      if (logs.length === 0) return { content: [{ type: "text", text: `No console logs captured.\nSession ID: ${args.sessionId}` }] };
      const text = logs.map((l) => `[${l.level.toUpperCase()}] ${l.text}`).join("\n");
      const label = logs.length === 1 ? "1 entry" : `${logs.length} entries`;
      return { content: [{ type: "text", text: `Console logs (${label}):\n\n${text}\n\nSession ID: ${args.sessionId}` }] };
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
      if (errors.length === 0) return { content: [{ type: "text", text: `No failed network requests captured. All requests returned 2xx/3xx status codes.\nSession ID: ${args.sessionId}` }] };
      const text = errors.map((e) => `${e.status} ${e.statusText} — ${e.url}`).join("\n");
      const label = errors.length === 1 ? "1 failed request" : `${errors.length} failed requests`;
      return { content: [{ type: "text", text: `Failed network requests (${label}):\n\n${text}\n\nSession ID: ${args.sessionId}` }] };
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
          `  LCP:   ${metrics.lcp !== null ? metrics.lcp + "ms" : "N/A (measured at page load; may update with lazy content)"}`,
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
        const sizeStr = r.size > 0 ? `${Math.round(r.size / 1024)}KB` : "0KB";
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
          ...(seo.jsonLd ? [`\nStructured Data (JSON-LD):\n${JSON.stringify(seo.jsonLd, null, 2).slice(0, 2000)}`] : []),
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

      // 2. Probe common login paths (use GET to check page content for login indicators)
      const commonPaths = [
        "/login", "/signin", "/sign-in", "/auth/login", "/auth/signin",
        "/account/login", "/account/signin", "/user/login", "/users/sign_in",
        "/admin/login", "/admin", "/wp-login.php", "/wp-admin",
        "/dashboard/login", "/portal/login", "/sso/login",
        "/auth", "/session/new", "/log-in", "/member/login",
      ];

      const loginIndicators = /password|sign.?in|log.?in|username|email.*password|credential/i;

      const probes = commonPaths.map(async (path) => {
        const probeUrl = `${base}${path}`;
        try {
          const res = await fetch(probeUrl, {
            method: "GET",
            redirect: "follow",
            signal: AbortSignal.timeout(4000),
          });
          if (res.status === 401 || res.status === 403) {
            found.push({ url: probeUrl, source: "common-path", status: res.status });
          } else if (res.ok) {
            // Check body for login-related content to avoid false positives
            const body = await res.text().catch(() => "");
            const snippet = body.slice(0, 5000).toLowerCase();
            if (loginIndicators.test(snippet)) {
              found.push({ url: probeUrl, source: "common-path", status: res.status });
            }
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
    "Attempt to log in to a website. Navigates to the login URL, finds email/username and password fields, fills them in, and submits the form. Returns a screenshot and reports whether login succeeded or failed. Always ask the user for credentials first — never guess. If the site requires email verification (OTP code), use read_verification_email to automatically fetch the code from Gmail (requires one-time authorize_email_access setup).",
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

          const SKIP = new Set(["SCRIPT","STYLE","NOSCRIPT","SVG","LINK","META"]);
          function walk(el: any, depth: number): any {
            if (!el || depth <= 0) return null;
            const tag = el.tagName || "";
            if (SKIP.has(tag)) return null;
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
        const nodeCount = (text.match(/"role"/g) || []).length;
        if (text.length > 50000) {
          return { content: [{ type: "text", text: `Accessibility tree for ${args.url} (~${nodeCount} nodes, truncated to 50k chars):\n${text.slice(0, 50000)}...` }] };
        }
        return { content: [{ type: "text", text: `Accessibility tree for ${args.url} (~${nodeCount} nodes):\n${text}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      } finally {
        if (context) await context.close().catch(() => {});
        await release();
      }
    }
  );

  // ── Visual Diff ──────────────────────────────────────────────
  server.tool(
    "screenshot_diff",
    "Compare two URLs pixel-by-pixel and return a diff overlay image showing exactly what changed. Returns the diff image URL, percentage of pixels changed, total changed pixel count, and a match score.",
    {
      urlA: z.string().url().describe("First URL (before)"),
      urlB: z.string().url().describe("Second URL (after)"),
      width: z.number().int().min(320).max(3840).default(1280).describe("Viewport width"),
      height: z.number().int().min(240).max(2160).default(800).describe("Viewport height"),
      threshold: z.number().min(0).max(1).default(0.1).describe("Color difference threshold (0=exact, 1=lenient)"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };

      const { acquire, release } = browserPool();
      const browser = await acquire();
      try {
        const page = await browser.newPage({ viewport: { width: args.width, height: args.height } });

        // Capture A
        await page.goto(args.urlA, { waitUntil: "networkidle", timeout: 30000 }).catch(() =>
          page.goto(args.urlA, { waitUntil: "load", timeout: 30000 })
        );
        const bufA = await page.screenshot({ type: "png", fullPage: false });

        // Capture B
        await page.goto(args.urlB, { waitUntil: "networkidle", timeout: 30000 }).catch(() =>
          page.goto(args.urlB, { waitUntil: "load", timeout: 30000 })
        );
        const bufB = await page.screenshot({ type: "png", fullPage: false });
        await page.close();

        // Decode PNGs
        const imgA = PNG.sync.read(Buffer.from(bufA));
        const imgB = PNG.sync.read(Buffer.from(bufB));

        // Ensure same size (use smaller dimensions)
        const w = Math.min(imgA.width, imgB.width);
        const h = Math.min(imgA.height, imgB.height);
        const diff = new PNG({ width: w, height: h });

        const changedPixels = pixelmatch(
          imgA.data, imgB.data, diff.data, w, h,
          { threshold: args.threshold, includeAA: true }
        );

        const totalPixels = w * h;
        const changedPct = ((changedPixels / totalPixels) * 100).toFixed(2);
        const matchScore = (100 - (changedPixels / totalPixels) * 100).toFixed(1);

        // Upload diff image to R2
        const diffBuf = PNG.sync.write(diff);
        const diffKey = `screenshots/diff-${nanoid()}.png`;
        const diffUrl = await uploadScreenshot(diffKey, Buffer.from(diffBuf), "image/png");

        // Also upload the two captures for reference
        const keyA = `screenshots/diff-a-${nanoid()}.png`;
        const keyB = `screenshots/diff-b-${nanoid()}.png`;
        const urlAImg = await uploadScreenshot(keyA, Buffer.from(bufA), "image/png");
        const urlBImg = await uploadScreenshot(keyB, Buffer.from(bufB), "image/png");

        // Track usage
        await db.insert(usageEvents).values({ id: nanoid(), userId: auth.userId, screenshotId: null });

        return {
          content: [{
            type: "text",
            text: [
              `Visual Diff Complete!`,
              ``,
              `Before: ${urlAImg}`,
              `After:  ${urlBImg}`,
              `Diff:   ${diffUrl}`,
              ``,
              `Changed: ${changedPixels.toLocaleString()} pixels (${changedPct}%)`,
              `Match score: ${matchScore}%`,
              `Resolution: ${w}×${h}`,
              `Threshold: ${args.threshold}`,
            ].join("\n"),
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${humanizeError(err instanceof Error ? err.message : String(err))}` }] };
      } finally {
        await release();
      }
    }
  );

  // ── Batch Screenshots ──────────────────────────────────────
  // @ts-ignore - TS2589: MCP SDK generic inference too deep
  server.tool(
    "screenshot_batch",
    "Capture screenshots of multiple URLs in one call (max 10). Returns an array of results with screenshot URLs and metadata. All screenshots share the same viewport and format settings.",
    {
      urls: z.array(z.string().url()).min(1).max(10).describe("Array of URLs to screenshot (1-10)"),
      width: z.number().int().min(320).max(3840).default(1280).describe("Viewport width"),
      height: z.number().int().min(240).max(2160).default(800).describe("Viewport height"),
      fullPage: z.boolean().default(false).describe("Capture full scrollable page"),
      format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Image format"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };

      const startTime = Date.now();
      const results: string[] = [];

      // Enqueue all screenshots and poll
      const jobs = await Promise.all(
        args.urls.map((url) =>
          enqueueScreenshot(auth.userId, {
            url,
            width: args.width,
            height: args.height,
            fullPage: args.fullPage,
            format: args.format,
            delay: 0,
          })
        )
      );

      // Poll all jobs
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        let allDone = true;
        for (let j = 0; j < jobs.length; j++) {
          if (results[j]) continue; // already done
          const [row] = await db.select().from(screenshots).where(eq(screenshots.id, jobs[j]));
          if (row?.status === "done" && row.publicUrl) {
            const isPdf = row.publicUrl.endsWith(".pdf");
            const sizeStr = isPdf ? "PDF" : `${row.width ?? "?"}×${row.height ?? "?"} ${(row.format ?? "png").toUpperCase()}`;
            results[j] = `✅ ${args.urls[j]}\n   ${row.publicUrl}\n   ${sizeStr}`;
          } else if (row?.status === "failed") {
            results[j] = `❌ ${args.urls[j]}\n   Failed: ${humanizeError(row.errorMessage ?? "Unknown error")}`;
          } else {
            allDone = false;
          }
        }
        if (allDone) break;
      }

      // Fill any still-pending
      for (let j = 0; j < jobs.length; j++) {
        if (!results[j]) results[j] = `⏳ ${args.urls[j]}\n   Timed out after 60s. Job ID: ${jobs[j]}`;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const successCount = results.filter((r) => r.startsWith("✅")).length;

      return {
        content: [{
          type: "text",
          text: [
            `Batch Screenshots Complete! (${successCount}/${args.urls.length} succeeded in ${elapsed}s)`,
            ``,
            ...results,
          ].join("\n"),
        }],
      };
    }
  );

  // ── Cross-Browser Screenshots ──────────────────────────────
  server.tool(
    "screenshot_cross_browser",
    "Capture a URL in Chromium, Firefox, and WebKit simultaneously. Returns three screenshot URLs — one per browser engine. Useful for cross-browser visual testing.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      width: z.number().int().min(320).max(3840).default(1280).describe("Viewport width"),
      height: z.number().int().min(240).max(2160).default(800).describe("Viewport height"),
      fullPage: z.boolean().default(false).describe("Capture full scrollable page"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const limitErr = await checkLimit(auth.userId, auth.plan);
      if (limitErr) return { content: [{ type: "text", text: `Error: ${limitErr}` }] };

      const pw = await import("playwright");
      const browsers = [
        { name: "Chromium", launcher: pw.chromium },
        { name: "Firefox", launcher: pw.firefox },
        { name: "WebKit", launcher: pw.webkit },
      ];

      const startTime = Date.now();
      const results: string[] = [];

      await Promise.all(
        browsers.map(async ({ name, launcher }) => {
          try {
            const browser = await launcher.launch({ headless: true });
            const page = await browser.newPage({ viewport: { width: args.width, height: args.height } });
            await page.goto(args.url, { waitUntil: "networkidle", timeout: 30000 }).catch(() =>
              page.goto(args.url, { waitUntil: "load", timeout: 30000 })
            );
            const buf = await page.screenshot({ type: "png", fullPage: args.fullPage });
            await browser.close();

            const key = `screenshots/${name.toLowerCase()}-${nanoid()}.png`;
            const publicUrl = await uploadScreenshot(key, Buffer.from(buf), "image/png");
            await db.insert(usageEvents).values({ id: nanoid(), userId: auth.userId, screenshotId: null });
            results.push(`✅ ${name}: ${publicUrl}`);
          } catch (err) {
            results.push(`❌ ${name}: ${humanizeError(err instanceof Error ? err.message : String(err))}`);
          }
        })
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      return {
        content: [{
          type: "text",
          text: [
            `Cross-Browser Screenshots (${elapsed}s)`,
            `URL: ${args.url}`,
            `Viewport: ${args.width}×${args.height}${args.fullPage ? " (full page)" : ""}`,
            ``,
            ...results,
          ].join("\n"),
        }],
      };
    }
  );

  // ── Responsive Breakpoint Detection ────────────────────────
  server.tool(
    "find_breakpoints",
    "Detect responsive layout breakpoints for a URL. Scans viewport widths from 320px to 1920px and identifies where significant layout changes occur (large height jumps, content reflows). Returns a list of detected breakpoint widths.",
    {
      url: z.string().url().describe("The URL to analyze"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };

      const { acquire, release } = browserPool();
      const browser = await acquire();
      try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 800 } });
        await page.goto(args.url, { waitUntil: "networkidle", timeout: 30000 }).catch(() =>
          page.goto(args.url, { waitUntil: "load", timeout: 30000 })
        );

        // Scan widths
        const widths = [320, 375, 414, 480, 540, 600, 640, 720, 768, 800, 834, 900, 960, 1024, 1080, 1152, 1200, 1280, 1366, 1440, 1536, 1680, 1920];
        const measurements: { width: number; bodyHeight: number; scrollWidth: number }[] = [];

        for (const w of widths) {
          await page.setViewportSize({ width: w, height: 800 });
          await page.waitForTimeout(300);
          const m = await page.evaluate(() => ({
            bodyHeight: document.body.scrollHeight,
            scrollWidth: document.body.scrollWidth,
          }));
          measurements.push({ width: w, ...m });
        }

        // Also detect common CSS breakpoints in stylesheets (before closing page)
        const cssBreakpoints = await page.evaluate(() => {
          const bps = new Set<number>();
          try {
            for (const sheet of document.styleSheets) {
              try {
                for (const rule of sheet.cssRules) {
                  if (rule instanceof CSSMediaRule) {
                    const match = rule.conditionText?.match(/(?:min|max)-width:\s*(\d+)/g);
                    if (match) {
                      for (const m of match) {
                        const num = parseInt(m.replace(/\D/g, ""));
                        if (num >= 300 && num <= 2000) bps.add(num);
                      }
                    }
                  }
                }
              } catch { /* cross-origin */ }
            }
          } catch { /* no access */ }
          return [...bps].sort((a, b) => a - b);
        }).catch(() => [] as number[]);

        await page.close();

        // Detect breakpoints (significant height changes > 15%)
        const breakpoints: { width: number; description: string }[] = [];
        for (let i = 1; i < measurements.length; i++) {
          const prev = measurements[i - 1];
          const curr = measurements[i];
          const heightChange = Math.abs(curr.bodyHeight - prev.bodyHeight) / Math.max(prev.bodyHeight, 1);
          const overflowChanged = (prev.scrollWidth > prev.width) !== (curr.scrollWidth > curr.width);

          if (heightChange > 0.15) {
            const direction = curr.bodyHeight > prev.bodyHeight ? "taller" : "shorter";
            breakpoints.push({
              width: curr.width,
              description: `Layout shifts at ${curr.width}px — content becomes ${direction} (${Math.round(heightChange * 100)}% height change from ${prev.width}px)`,
            });
          }
          if (overflowChanged) {
            const status = curr.scrollWidth > curr.width ? "starts overflowing" : "stops overflowing";
            breakpoints.push({
              width: curr.width,
              description: `Content ${status} at ${curr.width}px (scrollWidth: ${curr.scrollWidth}px)`,
            });
          }
        }

        return {
          content: [{
            type: "text",
            text: [
              `Breakpoint Analysis for: ${args.url}`,
              ``,
              breakpoints.length > 0
                ? `Detected Layout Shifts (${breakpoints.length}):` + "\n" + breakpoints.map((b) => `  • ${b.description}`).join("\n")
                : `No significant layout shifts detected across ${widths.length} viewport widths.`,
              ``,
              cssBreakpoints.length > 0
                ? `CSS Media Query Breakpoints: ${cssBreakpoints.join("px, ")}px`
                : `No CSS @media breakpoints detected (may be cross-origin restricted).`,
              ``,
              `Scanned ${widths.length} widths: ${widths[0]}px → ${widths[widths.length - 1]}px`,
            ].join("\n"),
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${humanizeError(err instanceof Error ? err.message : String(err))}` }] };
      } finally {
        await release();
      }
    }
  );

  // ── AI UX Review (Kimi k2.5 Vision) ───────────────────────
  server.tool(
    "ux_review",
    "Run an AI-powered UX review on any URL. Captures a screenshot and analyzes it along with accessibility tree, SEO metadata, and performance metrics using Kimi k2.5 vision. Returns actionable UX feedback across categories: Accessibility, SEO, Performance, Navigation, Content, and Mobile-friendliness.",
    {
      url: z.string().url().describe("The URL to review"),
      width: z.number().int().min(320).max(3840).default(1280).describe("Viewport width"),
      height: z.number().int().min(240).max(2160).default(800).describe("Viewport height"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };

      const kimiKey = process.env.KIMI_API_KEY;
      if (!kimiKey) return { content: [{ type: "text", text: "Error: KIMI_API_KEY not configured on the server." }] };

      const { acquire, release } = browserPool();
      const browser = await acquire();
      try {
        const page = await browser.newPage({ viewport: { width: args.width, height: args.height } });
        await page.goto(args.url, { waitUntil: "networkidle", timeout: 30000 }).catch(() =>
          page.goto(args.url, { waitUntil: "load", timeout: 30000 })
        );

        // 1. Take screenshot
        const screenshotBuf = await page.screenshot({ type: "png", fullPage: false });

        // 2. Get accessibility tree (simplified)
        const a11yTree = await page.evaluate(() => {
          const items: string[] = [];
          const walk = (el: Element, depth: number) => {
            if (depth > 4) return;
            const tag = el.tagName.toLowerCase();
            if (["script", "style", "noscript", "svg"].includes(tag)) return;
            const role = el.getAttribute("role") || "";
            const ariaLabel = el.getAttribute("aria-label") || "";
            const text = el.textContent?.trim().slice(0, 60) || "";
            if (role || ariaLabel || ["h1", "h2", "h3", "h4", "a", "button", "input", "img", "nav", "main", "footer", "header"].includes(tag)) {
              items.push(`${"  ".repeat(depth)}<${tag}${role ? ` role="${role}"` : ""}${ariaLabel ? ` aria-label="${ariaLabel}"` : ""}> ${text}`);
            }
            for (const child of el.children) walk(child, depth + 1);
          };
          walk(document.body, 0);
          return items.slice(0, 80).join("\n");
        });

        // 3. Get basic SEO + perf data
        const pageData = await page.evaluate(() => {
          const getMeta = (name: string) => document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute("content") || "";
          return {
            title: document.title,
            description: getMeta("description"),
            ogTitle: getMeta("og:title"),
            ogImage: getMeta("og:image"),
            h1Count: document.querySelectorAll("h1").length,
            imgCount: document.querySelectorAll("img").length,
            imgWithoutAlt: document.querySelectorAll("img:not([alt])").length,
            linkCount: document.querySelectorAll("a").length,
            formCount: document.querySelectorAll("form").length,
          };
        });

        await page.close();

        // 4. Build prompt and call Kimi k2.5
        const b64 = "data:image/png;base64," + Buffer.from(screenshotBuf).toString("base64");

        const client = new OpenAI({ apiKey: kimiKey, baseURL: "https://api.moonshot.ai/v1" });

        const systemPrompt = `You are a senior UX reviewer. Analyze the provided screenshot and structured page data to give a professional UX audit. Rate each category 1-10 and provide specific, actionable recommendations. Be concise but thorough. Categories: Visual Design, Accessibility, SEO, Performance Indicators, Navigation/Layout, Content Quality, Mobile-friendliness.`;

        const userContent = [
          { type: "image_url" as const, image_url: { url: b64 } },
          {
            type: "text" as const,
            text: [
              `URL: ${args.url}`,
              `Viewport: ${args.width}×${args.height}`,
              ``,
              `Page Metadata:`,
              `  Title: ${pageData.title}`,
              `  Description: ${pageData.description || "(none)"}`,
              `  OG Title: ${pageData.ogTitle || "(none)"}`,
              `  OG Image: ${pageData.ogImage || "(none)"}`,
              `  H1 count: ${pageData.h1Count}`,
              `  Images: ${pageData.imgCount} total, ${pageData.imgWithoutAlt} missing alt`,
              `  Links: ${pageData.linkCount}`,
              `  Forms: ${pageData.formCount}`,
              ``,
              `Accessibility Tree (top nodes):`,
              a11yTree,
              ``,
              `Provide your UX review with scores and specific recommendations.`,
            ].join("\n"),
          },
        ];

        const completion = await client.chat.completions.create({
          model: "kimi-k2.5",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: 2000,
          // @ts-ignore - Kimi specific parameter
          thinking: { type: "disabled" },
        });

        const review = completion.choices[0]?.message?.content ?? "No review generated.";
        const tokens = completion.usage?.total_tokens ?? 0;

        return {
          content: [{
            type: "text",
            text: [
              `🔍 AI UX Review — ${args.url}`,
              `Viewport: ${args.width}×${args.height} | Powered by Kimi k2.5 Vision | ${tokens} tokens`,
              ``,
              review,
            ].join("\n"),
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      } finally {
        await release();
      }
    }
  );

  // ── Composio Gmail Integration ──────────────────────────────────────
  const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || "";
  const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID || "";
  const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";

  // @ts-ignore
  server.tool(
    "authorize_email_access",
    "One-time setup: Connect the user's Gmail account via OAuth so the AI can read verification emails automatically. Returns an authorization URL the user must visit. After authorizing, the AI can use read_verification_email to fetch OTP codes.",
    {},
    async () => {
      try {
        if (!COMPOSIO_API_KEY) {
          return { content: [{ type: "text", text: "Error: COMPOSIO_API_KEY not configured. Please set it in environment variables." }] };
        }

        // Create a session and authorize Gmail
        const resp = await fetch(`${COMPOSIO_BASE}/sessions/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": COMPOSIO_API_KEY },
          body: JSON.stringify({
            user_id: COMPOSIO_USER_ID || "screenshotsmcp-default",
            manage_connections: false,
          }),
        });
        const session = await resp.json();

        // Request Gmail authorization
        const authResp = await fetch(`${COMPOSIO_BASE}/sessions/${session.id || session.session_id}/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": COMPOSIO_API_KEY },
          body: JSON.stringify({
            toolkit: "gmail",
            callback_url: "https://screenshotsmcp-api-production.up.railway.app/composio/callback",
          }),
        });
        const authData = await authResp.json();

        const authUrl = authData.redirect_url || authData.redirectUrl || authData.url;
        if (authUrl) {
          return {
            content: [{
              type: "text",
              text: `## Gmail Authorization Required\n\nPlease visit this URL to connect your Gmail account:\n\n**${authUrl}**\n\nAfter authorizing, I'll be able to automatically read verification codes from your email when logging into websites.\n\nThis is a one-time setup.`,
            }],
          };
        }

        return { content: [{ type: "text", text: `Authorization response: ${JSON.stringify(authData)}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  // @ts-ignore
  server.tool(
    "read_verification_email",
    "Read the latest email verification code / OTP from the user's Gmail inbox. Use this after smart_login encounters a verification code screen. The user must have previously authorized Gmail access via authorize_email_access. Searches recent emails for verification codes from common senders (Clerk, Auth0, etc).",
    {
      sender: z.string().optional().describe("Optional sender email to filter by (e.g. 'noreply@clerk.dev')"),
      subject_keyword: z.string().optional().describe("Optional keyword to search in subject (e.g. 'verification', 'sign in')"),
      max_age_minutes: z.number().optional().default(5).describe("Only look at emails from the last N minutes (default: 5)"),
    },
    async ({ sender, subject_keyword, max_age_minutes }) => {
      try {
        if (!COMPOSIO_API_KEY) {
          return { content: [{ type: "text", text: "Error: COMPOSIO_API_KEY not configured." }] };
        }

        const userId = COMPOSIO_USER_ID || "screenshotsmcp-default";

        // Build Gmail search query
        const queryParts: string[] = [];
        if (sender) queryParts.push(`from:${sender}`);
        if (subject_keyword) queryParts.push(`subject:${subject_keyword}`);
        // Always filter to recent emails
        const ageMinutes = max_age_minutes || 5;
        queryParts.push(`newer_than:${ageMinutes}m`);
        // Common verification senders if no specific sender given
        if (!sender && !subject_keyword) {
          queryParts.push("(subject:verification OR subject:code OR subject:sign OR subject:confirm OR subject:OTP)");
        }

        const gmailQuery = queryParts.join(" ");

        // Execute GMAIL_FETCH_EMAILS via Composio
        const resp = await fetch(`${COMPOSIO_BASE}/tools/execute/GMAIL_FETCH_EMAILS`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": COMPOSIO_API_KEY },
          body: JSON.stringify({
            user_id: userId,
            arguments: {
              query: gmailQuery,
              max_results: 3,
              include_body: true,
            },
          }),
        });
        const result = await resp.json();

        if (!result.successful && !result.data) {
          // Gmail might not be connected yet
          return {
            content: [{
              type: "text",
              text: "Gmail is not connected yet. Please ask the user to run **authorize_email_access** first to connect their Gmail account, then retry.",
            }],
          };
        }

        const messages = result.data?.messages || result.messages || [];
        if (messages.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No verification emails found in the last ${ageMinutes} minutes. The email may not have arrived yet — wait a moment and try again, or ask the user to check their inbox manually.`,
            }],
          };
        }

        // Extract verification codes from email bodies
        const codePatterns = [
          /\b(\d{6})\b/,          // 6-digit code
          /\b(\d{4})\b/,          // 4-digit code  
          /\b(\d{8})\b/,          // 8-digit code
          /code[:\s]+(\d{4,8})/i, // "code: 123456"
          /pin[:\s]+(\d{4,8})/i,  // "pin: 1234"
        ];

        const results: string[] = [];
        for (const msg of messages) {
          const body = msg.body || msg.snippet || msg.text || "";
          const subject = msg.subject || "";
          const from = msg.from || "";
          
          let code = "";
          for (const pattern of codePatterns) {
            const match = body.match(pattern) || subject.match(pattern);
            if (match) {
              code = match[1];
              break;
            }
          }

          results.push(
            `**From:** ${from}\n**Subject:** ${subject}\n**Code found:** ${code || "No numeric code detected"}\n**Snippet:** ${(body || "").substring(0, 200)}`
          );
        }

        return {
          content: [{
            type: "text",
            text: `## Verification Emails Found (${messages.length})\n\n${results.join("\n\n---\n\n")}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error reading email: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  // ── AgentMail Integration ─────────────────────────────────────────────
  const AGENTMAIL_API_KEY_FALLBACK = process.env.AGENTMAIL_API_KEY || "";
  const NO_KEY_MSG = "Error: No AgentMail API key configured. Please add your AgentMail API key in **Dashboard → Settings** at https://web-phi-eight-56.vercel.app/dashboard/settings.\n\nAgentMail is free — sign up at https://console.agentmail.to to get your API key (starts with `am_`).";

  function getAgentMailKey(auth: AuthResult): string | null {
    if (auth.ok && auth.agentmailApiKey) return auth.agentmailApiKey;
    if (AGENTMAIL_API_KEY_FALLBACK) return AGENTMAIL_API_KEY_FALLBACK;
    return null;
  }

  // Generate a unique, strong password that won't be in breach databases
  function generateUniquePassword(): string {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghjkmnpqrstuvwxyz";
    const digits = "23456789";
    const symbols = "!@#$%&*?";
    const all = upper + lower + digits + symbols;
    let pw = "";
    // Ensure at least one of each type
    pw += upper[Math.floor(Math.random() * upper.length)];
    pw += lower[Math.floor(Math.random() * lower.length)];
    pw += digits[Math.floor(Math.random() * digits.length)];
    pw += symbols[Math.floor(Math.random() * symbols.length)];
    // Fill to 20 chars
    for (let i = 0; i < 16; i++) pw += all[Math.floor(Math.random() * all.length)];
    // Shuffle
    return pw.split("").sort(() => Math.random() - 0.5).join("");
  }

  // @ts-ignore
  server.tool(
    "create_test_inbox",
    "Create or reuse a disposable email inbox for testing. Returns email, password, and inbox ID. Automatically reuses an existing saved inbox when available — only creates a new one when needed or when force_new is true. The inbox and password are saved to the user's dashboard for reuse across sessions.",
    {
      username: z.string().optional().describe("Optional username prefix for the email (e.g. 'test-user' → test-user@agentmail.to). Auto-generated if omitted."),
      display_name: z.string().optional().describe("Optional display name for the inbox (e.g. 'Test User')"),
      force_new: z.boolean().optional().default(false).describe("Force creation of a new inbox even if existing ones are available. Use when testing registration flows."),
    },
    async ({ username, display_name, force_new }) => {
      try {
        const auth = await validateKey(apiKey);
        if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
        const amKey = getAgentMailKey(auth);
        if (!amKey) {
          return { content: [{ type: "text", text: NO_KEY_MSG }] };
        }

        // Check for existing active inboxes (reuse when possible)
        if (!force_new) {
          const existing = await db
            .select()
            .from(testInboxes)
            .where(and(eq(testInboxes.userId, auth.userId), eq(testInboxes.isActive, true)))
            .orderBy(desc(testInboxes.lastUsedAt))
            .limit(1);

          if (existing.length > 0) {
            const inbox = existing[0];
            // Update last used
            await db.update(testInboxes).set({ lastUsedAt: new Date() }).where(eq(testInboxes.id, inbox.id));
            return {
              content: [{
                type: "text",
                text: `## Reusing Saved Inbox\n\n- **Email:** ${inbox.email}\n- **Password:** ${inbox.password}\n- **Inbox ID:** ${inbox.email}\n\nThis is a previously saved inbox. Use this email and password for sign-up or login testing.\nUse **check_inbox** to read any emails that arrive.\n\nTo create a fresh inbox instead, call create_test_inbox with force_new: true.`,
              }],
            };
          }
        }

        // Create new inbox
        const client = new AgentMailClient({ apiKey: amKey });
        const opts: Record<string, string> = {};
        if (username) opts.username = username;
        if (display_name) opts.displayName = display_name;

        const inbox = await client.inboxes.create(opts);
        const inboxId = (inbox as any).inboxId || (inbox as any).inbox_id || (inbox as any).id;
        const email = (inbox as any).email || inboxId;

        // Generate a unique password
        const password = generateUniquePassword();

        // Save to database
        await db.insert(testInboxes).values({
          id: nanoid(),
          userId: auth.userId,
          email,
          password,
          displayName: display_name || null,
          lastUsedAt: new Date(),
        });

        return {
          content: [{
            type: "text",
            text: `## Disposable Inbox Created\n\n- **Email:** ${email}\n- **Password:** \`${password}\`\n- **Inbox ID:** ${inboxId}\n\nUse this email and password to register on websites. Then use **check_inbox** to read any verification emails that arrive.\n\n**Important:** Always use the password above — it is unique and won't trigger breach detection.\nThis inbox is saved to your dashboard (Settings → Test Inboxes) for reuse.`,
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("limit") || msg.includes("Limit")) {
          return { content: [{ type: "text", text: `Error: Inbox limit reached. Delete unused inboxes in the AgentMail console or upgrade your plan at https://agentmail.to\n\nOriginal error: ${msg}` }] };
        }
        return { content: [{ type: "text", text: `Error creating inbox: ${msg}` }] };
      }
    }
  );

  // @ts-ignore
  server.tool(
    "check_inbox",
    "Check a disposable AgentMail inbox for new messages. Use after create_test_inbox to read verification emails, OTP codes, welcome emails, or password reset links. Automatically extracts verification codes from email content.",
    {
      inbox_id: z.string().describe("The inbox ID or email address from create_test_inbox (e.g. 'random123@agentmail.to')"),
      limit: z.number().optional().default(5).describe("Max number of messages to retrieve (default: 5)"),
    },
    async ({ inbox_id, limit }) => {
      try {
        const auth = await validateKey(apiKey);
        if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
        const amKey = getAgentMailKey(auth);
        if (!amKey) {
          return { content: [{ type: "text", text: NO_KEY_MSG }] };
        }

        // Update lastUsedAt for this inbox
        await db.update(testInboxes).set({ lastUsedAt: new Date() }).where(and(eq(testInboxes.email, inbox_id), eq(testInboxes.userId, auth.userId)));

        const client = new AgentMailClient({ apiKey: amKey });

        const res = await client.inboxes.messages.list(inbox_id, { limit: limit || 5 });
        const messages = (res as any).messages || [];

        if (messages.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No messages yet in ${inbox_id}. The email may not have arrived yet — wait a few seconds and try again.`,
            }],
          };
        }

        // Code extraction patterns
        const codePatterns = [
          /\b(\d{6})\b/,
          /\b(\d{4})\b/,
          /\b(\d{8})\b/,
          /code[:\s]+(\d{4,8})/i,
          /pin[:\s]+(\d{4,8})/i,
          /verification[:\s]+(\d{4,8})/i,
        ];
        // URL extraction for verification links
        const linkPattern = /https?:\/\/[^\s<>"]+(?:verify|confirm|activate|token|auth)[^\s<>"]*/gi;

        const results: string[] = [];
        for (const msg of messages) {
          const body = (msg as any).extractedText || (msg as any).extracted_text || (msg as any).text || (msg as any).snippet || "";
          const subject = (msg as any).subject || "";
          const from = (msg as any).from || "";
          const date = (msg as any).createdAt || (msg as any).created_at || (msg as any).date || "";

          // Extract codes
          let code = "";
          for (const pattern of codePatterns) {
            const match = body.match(pattern) || subject.match(pattern);
            if (match) { code = match[1]; break; }
          }

          // Extract verification links
          const links = body.match(linkPattern) || [];

          let entry = `**From:** ${from}\n**Subject:** ${subject}\n**Date:** ${date}`;
          if (code) entry += `\n**Verification Code:** \`${code}\``;
          if (links.length > 0) entry += `\n**Verification Links:**\n${links.map((l: string) => `- ${l}`).join("\n")}`;
          entry += `\n**Body Preview:** ${body.substring(0, 300)}`;

          results.push(entry);
        }

        return {
          content: [{
            type: "text",
            text: `## Inbox: ${inbox_id} (${messages.length} messages)\n\n${results.join("\n\n---\n\n")}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error checking inbox: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  // @ts-ignore
  server.tool(
    "send_test_email",
    "Send an email from a disposable AgentMail inbox. Useful for testing contact forms, reply workflows, or sending test data to services.",
    {
      inbox_id: z.string().describe("The inbox ID or email address to send from"),
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      text: z.string().describe("Plain text email body"),
    },
    async ({ inbox_id, to, subject, text }) => {
      try {
        const auth = await validateKey(apiKey);
        const amKey = getAgentMailKey(auth);
        if (!amKey) {
          return { content: [{ type: "text", text: NO_KEY_MSG }] };
        }

        const client = new AgentMailClient({ apiKey: amKey });

        await client.inboxes.messages.send(inbox_id, {
          to,
          subject,
          text,
        });

        return {
          content: [{
            type: "text",
            text: `Email sent successfully!\n\n- **From:** ${inbox_id}\n- **To:** ${to}\n- **Subject:** ${subject}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error sending email: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  // ── CapSolver CAPTCHA Integration ────────────────────────────────────
  const CAPSOLVER_API_KEY = process.env.CAPSOLVER_API_KEY || "";

  server.tool(
    "solve_captcha",
    "Automatically solve CAPTCHAs on the current page using CapSolver AI. Supports Cloudflare Turnstile, reCAPTCHA v2/v3, and hCaptcha. Detects the CAPTCHA type and sitekey automatically, sends it to CapSolver for solving, injects the token, and optionally submits the form. Use this when a CAPTCHA blocks form submission during browser automation.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      type: z.enum(["turnstile", "recaptchav2", "recaptchav3", "hcaptcha"]).optional().describe("CAPTCHA type. Auto-detected if omitted."),
      sitekey: z.string().optional().describe("The CAPTCHA sitekey. Auto-detected from the page if omitted."),
      pageUrl: z.string().optional().describe("The page URL. Auto-detected from current page if omitted."),
      autoSubmit: z.boolean().optional().default(true).describe("Automatically click the submit button after solving (default: true)"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      if (!CAPSOLVER_API_KEY) return { content: [{ type: "text", text: "Error: CAPSOLVER_API_KEY not configured. Set it in environment variables." }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };

      try {
        const page = session.page;
        const url = args.pageUrl || page.url();

        // Auto-detect CAPTCHA type and sitekey from page
        const detection = await page.evaluate(() => {
          const result: { type?: string; sitekey?: string } = {};

          // Turnstile detection
          const tsInput = document.querySelector('input[name="cf-turnstile-response"]');
          const tsDiv = document.querySelector('[data-sitekey]');
          const hasTurnstile = !!window.turnstile || !!tsInput;
          if (hasTurnstile) {
            result.type = 'turnstile';
            result.sitekey = tsDiv?.getAttribute('data-sitekey') || '';
            // Try to get sitekey from Clerk's captcha container or turnstile render
            if (!result.sitekey) {
              const scripts = document.querySelectorAll('script');
              for (const s of scripts) {
                const match = s.textContent?.match(/sitekey['":\s]+['"]?(0x[a-fA-F0-9]+)/);
                if (match) { result.sitekey = match[1]; break; }
              }
            }
          }

          // reCAPTCHA detection
          const recapDiv = document.querySelector('.g-recaptcha, [data-sitekey]');
          if (recapDiv && !hasTurnstile) {
            result.sitekey = recapDiv.getAttribute('data-sitekey') || '';
            const isV3 = !!document.querySelector('script[src*="recaptcha/api.js?render="]');
            result.type = isV3 ? 'recaptchav3' : 'recaptchav2';
          }

          // hCaptcha detection
          const hcapDiv = document.querySelector('.h-captcha, [data-sitekey]');
          if (hcapDiv && !hasTurnstile && !recapDiv) {
            result.type = 'hcaptcha';
            result.sitekey = hcapDiv.getAttribute('data-sitekey') || '';
          }

          return result;
        });

        const captchaType = args.type || detection.type;
        const sitekey = args.sitekey || detection.sitekey || '';

        if (!captchaType) {
          return { content: [{ type: "text", text: "No CAPTCHA detected on this page. If you're sure there is one, specify the type and sitekey manually." }] };
        }

        // If Turnstile and no sitekey found, try to get it from network requests
        let finalSitekey = sitekey;
        if (captchaType === 'turnstile' && !finalSitekey) {
          // Check network requests for Turnstile sitekey
          const networkSitekey = session.networkRequests
            .map(r => r.url)
            .find(u => u.includes('turnstile') && u.includes('sitekey='));
          if (networkSitekey) {
            const match = networkSitekey.match(/sitekey=([^&]+)/);
            if (match) finalSitekey = match[1];
          }
          // Last resort: try Clerk's Turnstile config from page
          if (!finalSitekey) {
            finalSitekey = await page.evaluate(() => {
              // Clerk passes sitekey via their API response, check for it in page state
              const els = document.querySelectorAll('[id*="clerk"]');
              for (const el of els) {
                const sk = el.getAttribute('data-sitekey') || el.getAttribute('data-cl-sitekey') || '';
                if (sk) return sk;
              }
              // Check for Clerk's environment config
              try {
                const clerkEnv = (window as any).__clerk_frontend_api || (window as any).Clerk;
                if (clerkEnv?.__unstable__environment?.displayConfig?.captchaPublicKey) {
                  return clerkEnv.__unstable__environment.displayConfig.captchaPublicKey;
                }
              } catch {}
              return '';
            });
          }
        }

        if (!finalSitekey) {
          // For Clerk sites: fetch sitekey from the Clerk environment API
          const clerkSitekey = await page.evaluate(async () => {
            try {
              const clerkFapi = (window as any).Clerk?.frontendApi || '';
              if (!clerkFapi) return '';
              const dbJwt = document.cookie.match(/__clerk_db_jwt=([^;]+)/)?.[1] || '';
              const envResp = await fetch('https://' + clerkFapi + '/v1/environment?__clerk_api_version=2025-11-10&_clerk_js_version=6.6.0&__dev_session=' + dbJwt, { credentials: 'include' });
              const envText = await envResp.text();
              const keyMatch = envText.match(/"captcha_public_key":"([^"]+)"/);
              return keyMatch?.[1] || '';
            } catch { return ''; }
          });
          if (clerkSitekey) finalSitekey = clerkSitekey;
        }

        if (!finalSitekey) {
          return { content: [{ type: "text", text: `Detected ${captchaType} CAPTCHA but couldn't find the sitekey. Please provide it manually via the sitekey parameter.` }] };
        }

        // Map to CapSolver task types
        const taskTypeMap: Record<string, string> = {
          turnstile: 'AntiTurnstileTaskProxyLess',
          recaptchav2: 'ReCaptchaV2TaskProxyLess',
          recaptchav3: 'ReCaptchaV3TaskProxyLess',
          hcaptcha: 'HCaptchaTaskProxyLess',
        };
        const taskType = taskTypeMap[captchaType] || 'AntiTurnstileTaskProxyLess';

        // Step 1: Create task
        const createRes = await fetch('https://api.capsolver.com/createTask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientKey: CAPSOLVER_API_KEY,
            task: {
              type: taskType,
              websiteURL: url,
              websiteKey: finalSitekey,
            },
          }),
        });
        const createData = await createRes.json() as any;

        if (createData.errorId && createData.errorId !== 0) {
          return { content: [{ type: "text", text: `CapSolver error: ${createData.errorDescription || createData.errorCode || 'Unknown error'}` }] };
        }

        const taskId = createData.taskId;
        if (!taskId) {
          return { content: [{ type: "text", text: `CapSolver failed to create task. Response: ${JSON.stringify(createData).substring(0, 200)}` }] };
        }

        // Step 2: Poll for result with auto-retry
        const startTime = Date.now();
        let token = '';
        let lastError = '';

        for (let attempt = 0; attempt < 2 && !token; attempt++) {
          let currentTaskId = taskId;

          // On retry, create a new task
          if (attempt > 0) {
            const retryRes = await fetch('https://api.capsolver.com/createTask', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientKey: CAPSOLVER_API_KEY, task: { type: taskType, websiteURL: url, websiteKey: finalSitekey } }),
            });
            const retryData = await retryRes.json() as any;
            if (!retryData.taskId) break;
            currentTaskId = retryData.taskId;
          }

          const pollStart = Date.now();
          while (Date.now() - pollStart < 60000) {
            await new Promise(r => setTimeout(r, 2000));
            const resultRes = await fetch('https://api.capsolver.com/getTaskResult', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientKey: CAPSOLVER_API_KEY, taskId: currentTaskId }),
            });
            const resultData = await resultRes.json() as any;

            if (resultData.status === 'ready') {
              token = resultData.solution?.token || '';
              break;
            }
            if (resultData.status === 'failed' || (resultData.errorId && resultData.errorId !== 0)) {
              lastError = resultData.errorDescription || resultData.errorCode || 'Unknown error';
              break;
            }
          }
        }

        if (!token) {
          return { content: [{ type: "text", text: `CapSolver failed after retry. ${lastError || 'Timed out (60s).'}` }] };
        }

        // Step 3: Inject token into the page
        const injected = await page.evaluate((data) => {
          const { type, token } = data;
          if (type === 'turnstile') {
            // Set the hidden input value
            const input = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement;
            if (input) {
              input.value = token;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            // Also try turnstile callback
            try {
              const widgets = (window as any).turnstile;
              if (widgets?.getResponse) {
                // Override getResponse to return our token
                (window as any).turnstile.getResponse = () => token;
              }
            } catch {}
            return !!input;
          }
          if (type === 'recaptchav2' || type === 'recaptchav3') {
            const textarea = document.querySelector('#g-recaptcha-response, textarea[name="g-recaptcha-response"]') as HTMLTextAreaElement;
            if (textarea) {
              textarea.value = token;
              textarea.style.display = 'block';
            }
            try { (window as any).___grecaptcha_cfg?.clients?.[0]?.callback?.(token); } catch {}
            return !!textarea;
          }
          if (type === 'hcaptcha') {
            const textarea = document.querySelector('textarea[name="h-captcha-response"]') as HTMLTextAreaElement;
            if (textarea) textarea.value = token;
            try { (window as any).hcaptcha?.getRespKey?.(); } catch {}
            return !!textarea;
          }
          return false;
        }, { type: captchaType, token });

        // For Clerk/Turnstile: call the Clerk sign-up/sign-in API directly with the token
        let clerkResult = '';
        if (captchaType === 'turnstile') {
          clerkResult = await page.evaluate(async (tk) => {
            try {
              // Find Clerk's frontend API base URL
              const clerkFapi = (window as any).Clerk?.frontendApi || '';
              if (!clerkFapi) return 'no-clerk';

              const dbJwt = document.cookie.match(/__clerk_db_jwt=([^;]+)/)?.[1] || '';
              const baseUrl = 'https://' + clerkFapi;

              // Detect Clerk JS version dynamically
              const clerkVer = (window as any).Clerk?.version || '6.6.0';
              const qs = `__clerk_api_version=2025-11-10&_clerk_js_version=${clerkVer}&__dev_session=${dbJwt}`;

              // Get current form values
              const emailInput = document.querySelector('input[name="emailAddress"]') as HTMLInputElement;
              const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
              const email = emailInput?.value || '';
              const password = passwordInput?.value || '';

              if (!email) return 'no-email';

              // Determine if this is sign-up or sign-in
              const isSignUp = location.pathname.includes('sign-up');

              if (isSignUp) {
                const res = await fetch(baseUrl + '/v1/client/sign_ups?' + qs, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({
                    email_address: email,
                    password: password,
                    strategy: 'email_code',
                    captcha_token: tk,
                    captcha_widget_type: 'smart'
                  }),
                  credentials: 'include'
                });
                const data = await res.json();
                if (data.errors) return 'error:' + (data.errors[0]?.code || 'unknown') + ':' + (data.errors[0]?.message || '').substring(0, 100);
                // Clerk returns sign_up in different paths depending on version
                const signUp = data?.meta?.client?.sign_up || data?.response?.sign_up || data?.client?.sign_up || {};
                const suId = signUp.id || '';
                const suStatus = signUp.status || '';

                if (suId && suStatus === 'missing_requirements') {
                  // Clerk auto-sends verification email on sign-up creation,
                  // but call prepare_verification to be safe
                  try {
                    await fetch(baseUrl + '/v1/client/sign_ups/' + suId + '/prepare_verification?' + qs, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                      body: new URLSearchParams({ strategy: 'email_code' }),
                      credentials: 'include'
                    });
                  } catch {}
                  return 'signup-ok:' + suId + ':verification-sent';
                }
                return 'signup:' + (suStatus || 'created');
              } else {
                // Sign-in flow
                const res = await fetch(baseUrl + '/v1/client/sign_ins?' + qs, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({
                    identifier: email,
                    password: password,
                    strategy: 'password',
                    captcha_token: tk,
                    captcha_widget_type: 'smart'
                  }),
                  credentials: 'include'
                });
                const data = await res.json();
                if (data.errors) return 'error:' + (data.errors[0]?.code || 'unknown') + ':' + (data.errors[0]?.message || '').substring(0, 100);
                const signIn = data?.meta?.client?.sign_in || data?.response?.sign_in || data?.client?.sign_in || {};
                return 'signin:' + (signIn.status || 'unknown');
              }
            } catch (e) {
              return 'exception:' + (e as Error).message;
            }
          }, token);

          // If Clerk API succeeded, reload the page to pick up the new session state
          if (clerkResult.startsWith('signup-ok') || clerkResult.startsWith('signin:complete')) {
            await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(2000);
          }
        }

        // Auto-submit for non-Clerk sites, or Clerk sites where API call failed/wasn't applicable
        const shouldAutoSubmit = args.autoSubmit !== false && (!clerkResult || clerkResult === 'no-clerk' || clerkResult === 'no-email');
        if (shouldAutoSubmit) {
          await page.waitForTimeout(1000);
          try {
            const submitBtn = page.locator('button[type="submit"], button.cl-formButtonPrimary, form button:not([type="button"]), input[type="submit"]').first();
            if (await submitBtn.count() > 0) {
              await submitBtn.click({ timeout: 5000 });
            }
          } catch {}
          await page.waitForTimeout(2000);
        }

        const img = await pageScreenshot(page);
        const solveTime = ((Date.now() - startTime) / 1000).toFixed(1);

        // Build result message
        let clerkInfo = '';
        if (clerkResult) {
          if (clerkResult.startsWith('signup-ok')) {
            const parts = clerkResult.split(':');
            clerkInfo = `\n- **Clerk sign-up:** Created (ID: ${parts[1]})\n- **Email verification:** Code sent to inbox`;
          } else if (clerkResult.startsWith('signin:complete')) {
            clerkInfo = `\n- **Clerk sign-in:** Completed successfully`;
          } else if (clerkResult.startsWith('error:')) {
            clerkInfo = `\n- **Clerk API:** ${clerkResult.substring(6)}`;
          } else {
            clerkInfo = `\n- **Clerk:** ${clerkResult}`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `## CAPTCHA Solved!\n\n- **Type:** ${captchaType}\n- **Sitekey:** ${finalSitekey.substring(0, 20)}...\n- **Solve time:** ${solveTime}s\n- **Token injected:** ${injected ? 'Yes' : 'Manual injection needed'}${clerkInfo}\n\nToken: \`${token.substring(0, 40)}...\``,
            },
            img,
          ],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error solving CAPTCHA: ${err instanceof Error ? err.message : String(err)}` }] };
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
