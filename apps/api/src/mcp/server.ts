import { Router, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { screenshots, apiKeys, users, usageEvents, testInboxes, websiteAuthMemories, webhookEndpoints, webhookDeliveries, runs, runOutcomes } from "@screenshotsmcp/db";
import { screenshotQueue } from "../lib/queue.js";
import { createHash, randomBytes } from "crypto";
import { eq, and, count, gte, desc } from "drizzle-orm";
import { PLAN_LIMITS } from "@screenshotsmcp/types";
import { createSession, getSession, closeSession, pageScreenshot, navigateWithRetry, setSessionOutcomeContext, setSessionStartUrl, setSessionViewport } from "../lib/sessions.js";
import { browserPool } from "../lib/browser-pool.js";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import OpenAI from "openai";
import { uploadScreenshot } from "../lib/r2.js";
import { AgentMailClient } from "agentmail";
import { emitWebhookEvent } from "../lib/webhook-delivery.js";
import { humanClick, humanMouseMove, idleHover, naturalPause } from "../lib/human.js";

export const mcpRouter = Router();

type AuthResult =
  | { ok: true; userId: string; plan: "free" | "starter" | "pro"; agentmailApiKey?: string | null }
  | { ok: false; error: string };

type SuccessfulAuth = Extract<AuthResult, { ok: true }>;
type AuthAssistOutcome = "login_success" | "login_failed" | "signup_success" | "signup_failed" | "verification_required" | "verification_success";

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

/**
 * Capture the before-snapshot of a page right before a mutating browser tool
 * runs. Returns `prevUrl/prevTitle/prevHeading` to thread into pageScreenshot
 * so the narrated run timeline can compute a URL/heading delta.
 */
async function captureBefore(page: import("playwright").Page) {
  let prevUrl: string | null = null;
  let prevTitle: string | null = null;
  let prevHeading: string | null = null;
  try { prevUrl = page.url(); } catch { /* ignore */ }
  try { prevTitle = await page.title(); } catch { /* ignore */ }
  try {
    prevHeading = await page.evaluate(() => {
      const h = document.querySelector("h1,h2");
      return h ? (h.textContent || "").trim().slice(0, 200) : null;
    });
  } catch { /* ignore */ }
  return { prevUrl, prevTitle, prevHeading };
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

function normalizeOrigin(rawUrl: string): string {
  return new URL(rawUrl).origin.toLowerCase();
}

async function getPrimaryInbox(userId: string) {
  const rows = await db
    .select()
    .from(testInboxes)
    .where(and(eq(testInboxes.userId, userId), eq(testInboxes.isActive, true)))
    .orderBy(desc(testInboxes.lastUsedAt), desc(testInboxes.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

async function touchInboxUsage(inboxId: string) {
  await db.update(testInboxes).set({ lastUsedAt: new Date() }).where(eq(testInboxes.id, inboxId));
}

async function getWebsiteAuthMemory(userId: string, origin: string) {
  const rows = await db
    .select()
    .from(websiteAuthMemories)
    .where(and(eq(websiteAuthMemories.userId, userId), eq(websiteAuthMemories.origin, origin)))
    .limit(1);

  return rows[0] ?? null;
}

async function getKnownSitesForInbox(userId: string, inboxId?: string | null) {
  if (!inboxId) {
    return [];
  }

  const rows = await db
    .select()
    .from(websiteAuthMemories)
    .where(eq(websiteAuthMemories.userId, userId))
    .orderBy(desc(websiteAuthMemories.lastSuccessAt), desc(websiteAuthMemories.updatedAt));

  return rows.filter((row) => row.inboxId === inboxId && !!row.origin).slice(0, 5);
}

function getRecommendedAuthAction(memory: any, intent: "auto" | "sign_in" | "sign_up") {
  if (intent !== "auto") {
    return intent;
  }

  if (!memory) {
    return "sign_in_then_sign_up";
  }

  if (memory.preferredAuthAction && memory.preferredAuthAction !== "unknown") {
    return memory.preferredAuthAction;
  }

  if (memory.loginStatus === "success" || memory.signupStatus === "success") {
    return "sign_in";
  }

  if (memory.loginStatus === "failed" && memory.signupStatus !== "success") {
    return "sign_up";
  }

  return "sign_in_then_sign_up";
}

function getAccountExistsConfidence(memory: any) {
  if (!memory) {
    return "unknown";
  }

  if (memory.loginStatus === "success" || memory.signupStatus === "success" || memory.verificationRequired || memory.lastSuccessAt) {
    return "high";
  }

  if (memory.loginStatus === "failed" && memory.signupStatus !== "success") {
    return "low";
  }

  return "medium";
}

function getKnownAuthMethod(memory: any) {
  if (!memory) {
    return "unknown";
  }

  if (memory.verificationRequired || memory.lastSuccessfulAuthPath === "otp_verify") {
    return "password_then_email_code";
  }

  if (memory.loginStatus === "success") {
    return "password_only";
  }

  if (memory.signupStatus === "success") {
    return memory.verificationRequired ? "sign_up_then_email_code" : "sign_up_then_sign_in";
  }

  return "unknown";
}

function getExpectedFollowup(memory: any) {
  if (!memory) {
    return "unknown";
  }

  if (memory.verificationRequired) {
    return "email_code";
  }

  if (memory.lastSuccessAt || memory.lastSuccessfulAuthPath) {
    return "none";
  }

  return "unknown";
}

function getAuthEvidence(memory: any) {
  if (!memory) {
    return [];
  }

  const evidence: string[] = [];

  if (memory.loginStatus && memory.loginStatus !== "unknown") {
    evidence.push(`login status is ${memory.loginStatus}`);
  }

  if (memory.signupStatus && memory.signupStatus !== "unknown") {
    evidence.push(`signup status is ${memory.signupStatus}`);
  }

  if (memory.lastSuccessAt) {
    evidence.push(`last successful auth was at ${new Date(memory.lastSuccessAt).toISOString()}`);
  }

  if (memory.verificationRequired) {
    evidence.push("email verification is expected on new-device or OTP flows");
  }

  if (memory.loginUrl) {
    evidence.push(`saved login URL is ${memory.loginUrl}`);
  }

  if (memory.lastError) {
    evidence.push(`last recorded error was: ${memory.lastError}`);
  }

  return evidence;
}

function getReusableAuthGuidance(memory: any, recommendedAction: string) {
  const guidance: string[] = [
    "Reuse the saved primary inbox unless you explicitly need a fresh registration identity.",
  ];

  if (recommendedAction === "sign_in") {
    guidance.push("Start with sign-in because prior evidence suggests this identity likely already exists for this origin.");
  } else if (recommendedAction === "sign_up") {
    guidance.push("Start with sign-up because prior evidence suggests sign-in is unlikely to work for this origin.");
  } else {
    guidance.push("Prefer sign-in first, then switch to sign-up only if the site clearly says the account does not exist.");
  }

  if (getExpectedFollowup(memory) === "email_code") {
    guidance.push("Treat verification, email-code, or OTP steps as normal auth paths for this origin rather than as immediate failures.");
  } else {
    guidance.push("If the site asks for verification, magic-link, or OTP completion, continue that flow before deciding the auth attempt failed.");
  }

  guidance.push("If the auth UI is brittle or multi-step, fall back to browser tools and inspect console or network evidence before concluding the flow is blocked.");
  guidance.push("Record the outcome after the attempt so future runs can reuse what worked for this origin.");

  return guidance;
}

function getSiteSpecificHints(memory: any) {
  if (!memory) {
    return [];
  }

  const hints: string[] = [];

  if (memory.loginUrl) {
    hints.push(`known login URL: ${memory.loginUrl}`);
  }

  if (memory.lastSuccessfulAuthPath) {
    hints.push(`last successful path: ${memory.lastSuccessfulAuthPath}`);
  }

  if (memory.notes) {
    hints.push(`saved site note: ${memory.notes}`);
  }

  if (memory.lastError) {
    hints.push(`last recorded friction: ${memory.lastError}`);
  }

  return hints;
}

function formatKnownSites(rows: any[], currentOrigin?: string) {
  const filtered = rows.filter((row) => row.origin !== currentOrigin);
  if (filtered.length === 0) {
    return "None recorded yet.";
  }

  return filtered
    .map((row) => {
      const status = row.loginStatus === "success"
        ? "login success"
        : row.signupStatus === "success"
          ? "signup success"
          : row.lastSuccessfulAuthPath || "seen";
      return `${row.origin} (${status})`;
    })
    .join(", ");
}

function describeWebsiteAuthMemory(memory: any) {
  if (!memory) {
    return "No saved auth history for this origin yet.";
  }

  const parts: string[] = [];

  if (memory.loginStatus && memory.loginStatus !== "unknown") {
    parts.push(`login status: ${memory.loginStatus}`);
  }

  if (memory.signupStatus && memory.signupStatus !== "unknown") {
    parts.push(`signup status: ${memory.signupStatus}`);
  }

  const confidence = getAccountExistsConfidence(memory);
  if (confidence !== "unknown") {
    parts.push(`account exists confidence: ${confidence}`);
  }

  const authMethod = getKnownAuthMethod(memory);
  if (authMethod !== "unknown") {
    parts.push(`known auth method: ${authMethod}`);
  }

  const followup = getExpectedFollowup(memory);
  if (followup !== "unknown") {
    parts.push(`expected follow-up: ${followup}`);
  }

  if (memory.lastSuccessfulAuthPath) {
    parts.push(`last successful path: ${memory.lastSuccessfulAuthPath}`);
  }

  if (memory.verificationRequired) {
    parts.push("email verification is usually required");
  }

  if (memory.loginUrl) {
    parts.push(`saved login URL: ${memory.loginUrl}`);
  }

  if (memory.lastError) {
    parts.push(`last error: ${memory.lastError}`);
  }

  if (parts.length === 0) {
    return "Saved auth memory exists, but there is no confirmed success or failure yet.";
  }

  return parts.join("; ");
}

async function upsertWebsiteAuthMemory(input: {
  userId: string;
  origin: string;
  inboxId?: string | null;
  inboxEmail?: string | null;
  loginUrl?: string | null;
  preferredAuthAction?: string;
  outcome?: AuthAssistOutcome;
  verificationRequired?: boolean;
  notes?: string;
}) {
  const now = new Date();
  const existing = await getWebsiteAuthMemory(input.userId, input.origin);
  const values: any = {
    updatedAt: now,
    lastUsedAt: now,
  };

  if (input.inboxId !== undefined) {
    values.inboxId = input.inboxId;
  }

  if (input.inboxEmail !== undefined) {
    values.inboxEmail = input.inboxEmail;
  }

  if (input.loginUrl !== undefined) {
    values.loginUrl = input.loginUrl;
  }

  if (input.notes !== undefined) {
    values.notes = input.notes;
  }

  if (input.verificationRequired !== undefined) {
    values.verificationRequired = input.verificationRequired;
  }

  if (input.preferredAuthAction && input.preferredAuthAction !== "unknown") {
    values.preferredAuthAction = input.preferredAuthAction;
  }

  switch (input.outcome) {
    case "login_success":
      values.loginStatus = "success";
      values.preferredAuthAction = "sign_in";
      values.lastSuccessfulAuthPath = "sign_in";
      values.lastError = null;
      values.lastSuccessAt = now;
      break;
    case "login_failed":
      values.loginStatus = "failed";
      values.preferredAuthAction = values.preferredAuthAction ?? "sign_up";
      values.lastError = input.notes ?? "Login failed";
      break;
    case "signup_success":
      values.signupStatus = "success";
      values.preferredAuthAction = "sign_in";
      values.lastSuccessfulAuthPath = "sign_up";
      values.lastError = null;
      values.lastSuccessAt = now;
      break;
    case "signup_failed":
      values.signupStatus = "failed";
      values.lastError = input.notes ?? "Sign-up failed";
      break;
    case "verification_required":
      values.verificationRequired = true;
      break;
    case "verification_success":
      values.verificationRequired = true;
      values.lastSuccessfulAuthPath = "otp_verify";
      values.lastError = null;
      values.lastSuccessAt = now;
      break;
    default:
      break;
  }

  if (existing) {
    await db
      .update(websiteAuthMemories)
      .set(values)
      .where(eq(websiteAuthMemories.id, existing.id));

    return getWebsiteAuthMemory(input.userId, input.origin);
  }

  await db.insert(websiteAuthMemories).values({
    id: nanoid(),
    userId: input.userId,
    origin: input.origin,
    inboxId: input.inboxId ?? null,
    inboxEmail: input.inboxEmail ?? null,
    loginUrl: input.loginUrl ?? null,
    preferredAuthAction: values.preferredAuthAction ?? "unknown",
    signupStatus: values.signupStatus ?? "unknown",
    loginStatus: values.loginStatus ?? "unknown",
    verificationRequired: values.verificationRequired ?? false,
    lastSuccessfulAuthPath: values.lastSuccessfulAuthPath ?? null,
    lastError: values.lastError ?? null,
    notes: values.notes ?? null,
    lastUsedAt: now,
    lastSuccessAt: values.lastSuccessAt ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return getWebsiteAuthMemory(input.userId, input.origin);
}

function createMcpServer(apiKey: string | undefined) {
  const server = new McpServer({
    name: "screenshotsmcp",
    version: "1.0.0",
    description: `You have access to screenshotsmcp — a tool suite for capturing screenshots and automating browsers.

## Discovery Model
- Treat ScreenshotsMCP tools as atomic actions.
- Treat the ScreenshotsMCP skill as broad guidance for choosing the right path.
- Treat packaged workflows as targeted procedures for repeatable multi-step jobs.
- When the task is an audit, verification flow, or another repeatable multi-step procedure, check the available workflows before improvising.
- Do not load every workflow up front. Read only the workflow that matches the task.
- If terminal access exists and repeated tool calls are likely, prefer the CLI when it is clearly faster than repeated MCP round-trips. If terminal access is not available, stay in MCP.
- For multi-page performance audits in MCP, avoid opening many new browser sessions in parallel. Measure sequentially unless there is a proven reason to increase concurrency.
- Available workflow: **workflows/sitewide-performance-audit/WORKFLOW.md** — use when the user asks why a site is slow, wants the slowest pages identified, or wants a repeatable multi-page performance review.

## Screenshot Tools (quick captures, no session needed)
- **take_screenshot** — capture any URL at a custom viewport size. Supports fullPage (default) or viewport-only mode. Returns a public image URL with dimensions.
- **screenshot_mobile** — iPhone 14 Pro viewport (393×852). Supports viewport-only or full-page.
- **screenshot_tablet** — iPad viewport (820×1180). Supports viewport-only or full-page.
- **screenshot_responsive** — capture screenshots at desktop (1280×800), tablet (820×1180), and mobile (393×852) viewports in one call. By default captures viewport-only (recommended). Set fullPage to true for full-page captures. Returns all three URLs for responsive comparison.
- **screenshot_fullpage** — capture the entire scrollable page (always full-page). Use max_height to cap extremely long pages and prevent unreadable strips.
- **screenshot_dark** — capture a full-page screenshot with dark mode (prefers-color-scheme: dark) emulated. Works on sites that support dark mode via CSS media queries.
- **screenshot_element** — capture a screenshot of a specific element on the page by CSS selector. Only the matched element is captured, not the full page. Automatically waits for the element to appear (SPA-friendly). Use delay for pages that need extra hydration time.
- **screenshot_pdf** — export a webpage as a PDF document (A4 format with background graphics). Returns a public URL to the PDF file.
- **list_recent_screenshots** — list the most recent screenshots taken with this API key. Returns URLs and metadata.
- **get_screenshot_status** — check the status of a screenshot job by ID. Returns done/pending/failed and the public URL if ready.

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
**Standalone:** accessibility_snapshot — get raw accessibility tree for any URL without a session
**Accessibility:** accessibility_audit — real WCAG 2.1 AA compliance audit with pass/fail results, contrast checking, landmark verification

For extension-free local browser setup outside the remote session tools, the CLI now supports screenshotsmcp browser open <url>, which asks for explicit approval and opens an installed local browser in a fresh ScreenshotsMCP profile. Console logs and network activity are captured continuously while that managed browser stays open, and follow-up commands like browser status, browser goto, browser back, browser forward, browser click-at, browser hover, browser wait-for, browser select, browser viewport, browser screenshot, browser text, browser html, browser console, browser network-errors, browser network-requests, browser evidence, browser cookies, browser storage, browser eval, browser a11y, browser perf, browser seo, and browser close reconnect to that tracked managed browser over CDP. Add --record-video if the user wants browser close to return a local .webm recording path for the managed session, use browser evidence to export a timestamped live artifact bundle with the current screenshot, page state, observability logs, and session metadata, or use browser close --evidence when the finalized local recording should be included in that same bundle. Use that path when the user wants a local managed browser without manually installing an extension.

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
**SEO:** browser_seo_audit (meta, OG, Twitter cards, headings, structured data, alt text), og_preview (standalone OG/Twitter validator + social card mockup)
**Debugging:** browser_console_logs, browser_network_errors, browser_cookies, browser_storage

## Smart Login Flow
When the user asks you to test a flow that requires authentication (login, sign-in, sign-up, verification, etc.):
1. Start with **auth_test_assist** for the site URL — this is the primary auth entrypoint. It reuses the saved inbox/password, checks remembered auth state for that origin, and recommends sign-in vs sign-up.
2. If you need the login page, call **find_login_page** with the site's base URL.
3. Use **smart_login** when you already know the credentials you want to try and want an automated first pass.
4. If **smart_login** is uncertain on Clerk or multi-step auth UIs, immediately fall back to **browser_fill** + **browser_press_key** or **browser_evaluate** with form.requestSubmit().
5. If the UI appears stuck after submit, inspect **browser_network_requests**, **browser_console_logs**, and **browser_cookies** before assuming login failed.
6. For sign-up or verification flows, use **browser_fill**, **browser_click**, **solve_captcha**, and **check_inbox** as needed.
7. After a successful or failed auth attempt, call **auth_test_assist** with action: "record" so future runs remember what worked.

## Tips
- Screenshot tools return a public CDN URL (not inline images) **with dimensions**. Check dimensions to judge if the image will be useful.
- For responsive testing, prefer screenshot_responsive — it's faster than 3 separate calls.
- **For long pages** (e.g. product grids), use **fullPage: false** (viewport-only) or set **max_height** to cap the image height. Full-page captures on long pages produce unreadable strips.
- Browser tools return a JPEG screenshot after each action so you can see the result.
- Use **browser_set_viewport** to resize the browser mid-session for mobile/tablet testing without starting a new session.
- Use **browser_navigate** with width/height params to start a mobile session directly.
- **browser_get_accessibility_tree** is the best way to understand page structure for UX analysis.
- **accessibility_snapshot** returns the raw accessibility tree without needing a session.
- **accessibility_audit** is the WCAG compliance tool — use it when users ask to "audit accessibility" or "check WCAG compliance". It returns pass/fail results with criteria references.
- **browser_console_logs** and **browser_network_errors** capture errors automatically from the moment the session starts.
- When the user says "take a screenshot", use take_screenshot. When they say "check responsive", use screenshot_responsive + responsive_audit.
- **responsive_audit** runs in an active browser session and checks: horizontal overflow with culprit elements, touch target sizes, text below 16px, viewport meta, input zoom risk, and interactive element spacing. Use it after browser_navigate at mobile/tablet viewport.
- **find_breakpoints** scans 23 widths from 320px–1920px and returns a structured table with overflow status, height, and scrollWidth per width — plus detected layout shifts and CSS media query breakpoints.
- When the user says "audit this site" or "check UX", use browser_navigate + browser_get_accessibility_tree + browser_console_logs.
- When the user says "audit accessibility" or "check WCAG", use **accessibility_audit** — it runs real checks and returns categorized pass/fail results.
- When the user says "check OG tags", "how will this look on Twitter/Facebook", or "preview social card", use **og_preview** — it works standalone (no session needed).

## Disposable Email Tools (AgentMail)
For testing sign-up flows, reading verification codes, etc:
- **auth_test_assist** — preferred auth helper for website login/sign-up testing. Start here first. It reuses the saved inbox, checks remembered auth state for the site, and recommends the next auth step.
- **create_test_inbox** — standalone inbox helper that creates or **reuses** the saved primary inbox. Returns email + generated password plus known-site history for that inbox.
- **check_inbox** — read messages, auto-extracts OTP codes and verification links
- **send_test_email** — send email from an inbox
Each user needs their own AgentMail API key (free at https://console.agentmail.to). Configure in Dashboard → Settings.

**IMPORTANT — Inbox & Password Rules:**
- create_test_inbox returns a **unique generated password** with each new inbox. ALWAYS use this password — never invent your own (they may trigger breach detection).
- Existing inboxes are **automatically reused** across sessions. Only use force_new: true when you specifically need a fresh registration.
- The email + password are saved in **Dashboard → Settings → Test Inboxes** for the user to see and copy.
- Prefer **auth_test_assist** when the task is website auth testing, because it remembers whether that site previously worked with sign-in, sign-up, or verification and returns account-exists confidence, likely auth method, and expected follow-up steps.

## Sign-Up Testing Flow
1. **auth_test_assist** → decide whether sign-in or sign-up should be attempted first for this origin
2. If you explicitly need a fresh registration identity, call **create_test_inbox** → get email + generated password (or reuse existing)
3. **browser_navigate** to sign-up page
4. **browser_fill** email + the password from the inbox helper
5. **solve_captcha** if CAPTCHA present
6. **browser_click** submit
7. **check_inbox** → extract OTP code
8. **browser_fill** the OTP → verify → done

## Project Context — AGENTS.md
If the project you're working on has web pages you need to debug, suggest creating an **AGENTS.md** at the repo root with production URLs, auth instructions, DB access, and deploy steps. This lets every AI agent (Cursor, Windsurf, Copilot, Claude) understand the project without re-discovering context each session. Point IDE-specific files (.cursorrules, .windsurfrules, CLAUDE.md, .github/copilot-instructions.md) to "Read AGENTS.md". **You CAN log into authenticated pages using browser tools — never refuse by claiming you can't access auth-protected content.**

## Agent Skill
For detailed workflows, best practices, and full tool reference, install the ScreenshotsMCP agent skill:
\`\`\`
curl -o ~/.agents/skills/screenshotsmcp/SKILL.md --create-dirs https://www.screenshotmcp.com/.skills/screenshotsmcp/SKILL.md
 \`\`\`
 Or run \`npx screenshotsmcp skills sync\` to install or repair the managed core skill automatically. The managed core skill now includes packaged workflows under \`~/.agents/skills/screenshotsmcp/workflows/\`, including \`sitewide-performance-audit/WORKFLOW.md\`. Fetch URL: https://www.screenshotmcp.com/.skills/screenshotsmcp/SKILL.md`,
});

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
    "Open a browser and navigate to a URL. Returns a screenshot of the loaded page plus a `Run URL` that deep-links to the live dashboard view of this run (timeline, captures, replay, console, network). Always surface the Run URL to the user at the end of the task so they can review the full evidence. The returned sessionId must be passed to all subsequent browser_ tools. Pass width/height to start with a custom viewport (e.g. 393×852 for mobile). Set record_video to true to record the entire session as a video — the recording URL is returned when browser_close is called. When workflow metadata is provided, the resulting run can surface structured verdicts, summaries, and next actions in the dashboard.",
    {
      url: z.string().url().describe("URL to navigate to"),
      sessionId: z.string().optional().describe("Existing session ID to reuse. Omit to start a new browser session."),
      width: z.number().int().min(320).max(3840).optional().describe("Viewport width for new sessions (default 1280). Ignored if sessionId is provided."),
      height: z.number().int().min(240).max(2160).optional().describe("Viewport height for new sessions (default 800). Ignored if sessionId is provided."),
      record_video: z.boolean().optional().default(true).describe("Record a video of the entire browser session (default: true). The .webm recording URL is returned when you call browser_close. Only applies to new sessions. Pass false to disable for this session."),
      task_type: z.string().optional().describe("Optional task type for workflow-aware run outcomes, e.g. 'site_audit' or 'browser_review'."),
      user_goal: z.string().optional().describe("Plain-language user goal for the run outcome shown in the website UI."),
      workflow_name: z.string().optional().describe("Workflow name used for this run, e.g. 'sitewide-performance-audit'."),
      workflow_required: z.boolean().optional().describe("Whether this task requires workflow compliance to be considered valid."),
      auth_scope: z.enum(["in", "out", "mixed", "unknown"]).optional().describe("Whether authenticated pages are in scope for the run contract."),
      tool_path: z.enum(["mcp", "cli", "unknown"]).optional().describe("Execution path selected for this run contract."),
      page_set: z.array(z.string()).optional().describe("Representative page set or scope list for workflow-driven runs."),
      required_evidence: z.array(z.string()).optional().describe("Required evidence types for the run contract, e.g. screenshots, console, network, perf, or seo."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      if (args.url.startsWith("file://") || args.url.startsWith("file:///")) {
        return { content: [{ type: "text", text: "Error: file:// URLs are not supported — the browser runs remotely and cannot access local files. Use an http:// or https:// URL instead." }] };
      }
      try {
        const outcomeContext = {
          taskType: args.task_type,
          userGoal: args.user_goal,
          workflowUsed: args.workflow_name,
          workflowRequired: args.workflow_required,
          authScope: args.auth_scope,
          toolPath: args.tool_path,
          pageSet: args.page_set,
          requiredEvidence: args.required_evidence,
        };
        let sessionId = args.sessionId;
        let page;
        let isRecording = false;
        if (sessionId) {
          const session = await getSession(sessionId, auth.userId);
          if (!session) return { content: [{ type: "text", text: `Error: Session ${sessionId} not found or expired. Start a new one by omitting sessionId.` }] };
          page = session.page;
          isRecording = session.recording;
          await setSessionOutcomeContext(sessionId, auth.userId, outcomeContext).catch(() => false);
        } else {
          const vp = (args.width || args.height) ? { width: args.width || 1280, height: args.height || 800 } : undefined;
          sessionId = await createSession(auth.userId, vp, args.record_video, outcomeContext);
          const session = await getSession(sessionId, auth.userId);
          page = session!.page;
          isRecording = session!.recording;
        }
        await navigateWithRetry(page, args.url);
        await setSessionStartUrl(sessionId, auth.userId, args.url);
        const img = await pageScreenshot(page);
        const vpSize = page.viewportSize();
        const webAppUrl = (process.env.WEB_APP_URL || process.env.WEB_URL || "https://www.screenshotmcp.com").replace(/\/+$/, "");
        const runUrl = `${webAppUrl}/dashboard/runs/${encodeURIComponent(sessionId)}`;
        const recordingNote = isRecording ? "\n🔴 Recording session — call browser_close to get the video URL" : "";
        const workflowNote = args.workflow_name || args.user_goal
          ? `\nRun outcome context: ${args.user_goal || args.task_type || "general browser task"}${args.workflow_name ? ` · workflow ${args.workflow_name}` : ""}`
          : "";
        return { content: [{ type: "text", text: `Navigated to ${args.url}\nSession ID: ${sessionId}\nRun URL: ${runUrl}\nViewport: ${vpSize?.width}×${vpSize?.height}\n(Pass this sessionId to all browser_ tools)${recordingNote}${workflowNote}` }, img] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error navigating: ${humanizeError(err instanceof Error ? err.message : String(err))}` }] };
      }
    }
  );

  server.tool(
    "browser_click",
    "Click an element on the current browser page by CSS selector or visible text. Returns a screenshot after clicking. Optional `caption`: one-line note on why you're clicking this element — surfaces in the run timeline on the dashboard.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      selector: z.string().describe("CSS selector (e.g. '#submit-btn', '.nav-link') or visible text to click (e.g. 'Sign in', 'Submit')"),
      caption: z.string().optional().describe("Optional one-line note about why you're taking this action. Appears under the screenshot in the dashboard run timeline."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const page = session.page;
        const before = await captureBefore(page);
        const el = page.locator(args.selector).first();
        if (await el.count() === 0) {
          const textEl = page.getByText(args.selector, { exact: false }).first();
          await textEl.click({ timeout: 5000 });
        } else {
          await el.click({ timeout: 5000 });
        }
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        const img = await pageScreenshot(page, { toolName: "browser_click", arg: args.selector, agentNote: args.caption, ...before });
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
      caption: z.string().optional().describe("Optional one-line note about why you're taking this action. Appears under the screenshot in the dashboard run timeline."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const page = session.page;
        const before = await captureBefore(page);
        // Humanized motion: curved path, variable speed, pre-click dwell.
        const clicks = args.clickCount || 1;
        if (clicks <= 1) {
          await humanClick(page, args.x, args.y, { holdMin: args.delay || 30, holdMax: Math.max(60, args.delay || 60) });
        } else {
          await humanMouseMove(page, args.x, args.y);
          await naturalPause(page);
          await page.mouse.click(args.x, args.y, { clickCount: clicks, delay: args.delay || 50 });
        }
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(500);
        const img = await pageScreenshot(page, { toolName: "browser_click_at", arg: `(${args.x},${args.y})`, agentNote: args.caption, ...before });
        return { content: [{ type: "text", text: `Clicked at coordinates (${args.x}, ${args.y})` }, img] };
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error clicking at coordinates: ${humanizeError(raw)}` }] };
      }
    }
  );

  server.tool(
    "browser_fill",
    "Type text into an input field on the current browser page. Clears the field first, then types the value. Optional `caption`: one-line note surfaced in the dashboard run timeline.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
      selector: z.string().describe("CSS selector for the input field (e.g. '#email', 'input[name=password]', 'textarea')"),
      value: z.string().describe("Text to type into the field"),
      caption: z.string().optional().describe("Optional one-line note about this fill. Appears under the screenshot in the dashboard run timeline."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const page = session.page;
        const before = await captureBefore(page);
        await page.locator(args.selector).first().fill(args.value, { timeout: 5000 });
        const img = await pageScreenshot(page, { toolName: "browser_fill", arg: args.selector, arg2: args.value, agentNote: args.caption, ...before });
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
    "Close the browser session and free all resources. Always call this when the browser workflow is complete. Returns a `Run URL` pointing to the live dashboard view of this run — you MUST include this Run URL in your final reply to the user so they can review the captured timeline, evidence, console, and network. If the session was started with record_video: true, the video recording URL is also returned. If a Share URL is included, it's a public link that can be shared with teammates who don't have an account.",
    {
      sessionId: z.string().describe("Session ID to close"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const result = await closeSession(args.sessionId);
      const webAppUrl = (process.env.WEB_APP_URL || process.env.WEB_URL || "https://www.screenshotmcp.com").replace(/\/+$/, "");
      const runUrl = `${webAppUrl}/dashboard/runs/${encodeURIComponent(args.sessionId)}`;
      const [runRow] = await db.select({ shareToken: runs.shareToken }).from(runs).where(eq(runs.id, args.sessionId));
      const shareUrl = runRow?.shareToken ? `${webAppUrl}/shared/runs/${encodeURIComponent(runRow.shareToken)}` : null;
      if (result.videoUrl) {
        if (result.finalizationError) {
          return { content: [{ type: "text", text: `Session ${args.sessionId} closed.\nRun URL: ${runUrl}${shareUrl ? `\nShare URL: ${shareUrl}` : ""}\n\n🎬 **Session Recording:** ${result.videoUrl}\n\n⚠️ Recording completed, but replay persistence reported an issue: ${result.finalizationError}` }] };
        }
        if (!result.recordingId) {
          return { content: [{ type: "text", text: `Session ${args.sessionId} closed.\nRun URL: ${runUrl}${shareUrl ? `\nShare URL: ${shareUrl}` : ""}\n\n🎬 **Session Recording:** ${result.videoUrl}\n\n⚠️ Recording uploaded, but no replay record was created.` }] };
        }
        return { content: [{ type: "text", text: `Session ${args.sessionId} closed.\nRun URL: ${runUrl}${shareUrl ? `\nShare URL: ${shareUrl}` : ""}\n\n🎬 **Session Recording:** ${result.videoUrl}\n\nThis .webm video shows everything that happened during the browser session. Share it with users or use it for debugging.` }] };
      }
      if (result.finalizationError) {
        return { content: [{ type: "text", text: `Session ${args.sessionId} closed.\nRun URL: ${runUrl}${shareUrl ? `\nShare URL: ${shareUrl}` : ""}\n\nRecording finalization failed: ${result.finalizationError}` }] };
      }
      return { content: [{ type: "text", text: `Session ${args.sessionId} closed.\nRun URL: ${runUrl}${shareUrl ? `\nShare URL: ${shareUrl}` : ""}` }] };
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
      timeout: z.number().int().min(500).max(30000).optional().default(5000).describe("Max time in ms to wait for the selector (default 5000). Lower values fail faster when a selector doesn't match."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
      try {
        const sel = args.selector || "body";
        const loc = session.page.locator(sel).first();
        const count = await loc.count().catch(() => 0);
        if (sel !== "body" && count === 0) {
          return { content: [{ type: "text", text: `No element matching selector "${sel}" found on the page. Try a different selector or omit it to get all page text.` }] };
        }
        const text = await loc.innerText({ timeout: args.timeout });
        const trimmed = text.length > 30000 ? text.slice(0, 30000) + "\n...(truncated)" : text;
        return { content: [{ type: "text", text: `Page text from "${sel}":\n\n${trimmed}` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Timeout") || msg.includes("waiting for")) {
          return { content: [{ type: "text", text: `No element matching selector "${args.selector}" found within ${args.timeout}ms. Try a different selector or omit it to get all page text.` }] };
        }
        return { content: [{ type: "text", text: `Error: ${msg}` }] };
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
      timeout: z.number().int().min(500).max(30000).optional().default(5000).describe("Max time in ms to wait for the selector (default 5000). Lower values fail faster when a selector doesn't match."),
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
          const loc = session.page.locator(args.selector).first();
          const count = await loc.count().catch(() => 0);
          if (count === 0) {
            return { content: [{ type: "text", text: `No element matching selector "${args.selector}" found on the page. Try a different selector or omit it to get the full page HTML.` }] };
          }
          const prop = args.outer ? "outerHTML" : "innerHTML";
          html = await loc.evaluate((el, p) => (el as any)[p], prop, { timeout: args.timeout } as any);
        } else {
          html = await session.page.content();
        }
        const trimmed = html.length > 50000 ? html.slice(0, 50000) + "\n...(truncated)" : html;
        return { content: [{ type: "text", text: `HTML from ${source} (${html.length} chars${html.length > 50000 ? ", truncated" : ""}):\n\n${trimmed}` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Timeout") || msg.includes("waiting for")) {
          return { content: [{ type: "text", text: `No element matching selector "${args.selector}" found within ${args.timeout}ms. Try a different selector or omit it to get the full page HTML.` }] };
        }
        return { content: [{ type: "text", text: `Error: ${msg}` }] };
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
      if (errors.length === 0) return { content: [{ type: "text", text: "No failed network requests captured. All requests returned 2xx/3xx status codes.\nSession ID: ${args.sessionId}" }] };
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
        // Wait for LCP entry via PerformanceObserver (up to 5s)
        const lcpValue = await session.page.evaluate(() => {
          return new Promise<number | null>((resolve) => {
            let lastLcp: number | null = null;
            // Check if entries already exist
            const existing = (globalThis as any).performance.getEntriesByType("largest-contentful-paint");
            if (existing.length > 0) lastLcp = existing[existing.length - 1].startTime;
            try {
              const obs = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) lastLcp = entry.startTime;
              });
              obs.observe({ type: "largest-contentful-paint", buffered: true });
              // Give LCP up to 5s to fire, then return whatever we have
              setTimeout(() => { obs.disconnect(); resolve(lastLcp); }, 5000);
            } catch {
              resolve(lastLcp);
            }
          });
        });

        const metrics = await session.page.evaluate((lcpMs: number | null) => {
          const perf = (globalThis as any).performance;
          const nav = perf.getEntriesByType("navigation")[0] as any;
          const paint = perf.getEntriesByType("paint");
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
            lcp: lcpMs !== null ? Math.round(lcpMs) : null,
            cls: Math.round(clsScore * 1000) / 1000,
            domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
            loadComplete: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
            domNodes: (globalThis as any).document.querySelectorAll("*").length,
            resourceCount: resources.length,
            totalTransferKB: Math.round(totalTransferSize / 1024),
            resourcesByType,
          };
        }, lcpValue);

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

        // Semantic validation warnings
        const seoWarnings: string[] = [];
        const pageUrlNorm = seo.url.replace(/\/$/, "");

        // Canonical mismatch detection
        if (seo.canonical) {
          const canonicalNorm = seo.canonical.replace(/\/$/, "");
          if (canonicalNorm !== pageUrlNorm) {
            seoWarnings.push(`⚠️ CANONICAL MISMATCH: canonical (${seo.canonical}) does not match page URL (${seo.url}) — Google may treat this page as a duplicate of ${seo.canonical}`);
          }
        }

        // og:url mismatch detection
        if (seo.og.url) {
          const ogUrlNorm = seo.og.url.replace(/\/$/, "");
          if (ogUrlNorm !== pageUrlNorm) {
            seoWarnings.push(`⚠️ og:url MISMATCH: og:url (${seo.og.url}) does not match page URL (${seo.url}) — social shares will link to the wrong page`);
          }
        }

        // Structured data summary
        let structuredDataSummary = "None found";
        if (seo.jsonLd && seo.jsonLd.length > 0) {
          const types = seo.jsonLd.map((ld: any) => ld["@type"] || "Unknown").filter(Boolean);
          structuredDataSummary = `${seo.jsonLd.length} schema(s): ${types.join(", ")}`;
        }

        // robots.txt check — fetch from same origin
        let robotsTxtNote = "";
        try {
          const origin = new URL(seo.url).origin;
          const robotsResp = await session.page.evaluate(async (robotsUrl: string) => {
            try {
              const r = await fetch(robotsUrl);
              if (!r.ok) return { status: r.status, text: "" };
              return { status: r.status, text: await r.text() };
            } catch { return { status: 0, text: "" }; }
          }, `${origin}/robots.txt`);
          if (robotsResp.status === 200 && robotsResp.text) {
            const sitemapMatch = robotsResp.text.match(/Sitemap:\s*(.+)/i);
            if (sitemapMatch) {
              const sitemapUrl = sitemapMatch[1].trim();
              const sitemapOrigin = new URL(sitemapUrl).origin;
              if (sitemapOrigin !== origin) {
                seoWarnings.push(`⚠️ robots.txt SITEMAP MISMATCH: Sitemap URL (${sitemapUrl}) points to a different domain than the site (${origin})`);
              }
              robotsTxtNote = `Sitemap in robots.txt: ${sitemapUrl}`;
            } else {
              robotsTxtNote = "robots.txt exists but contains no Sitemap directive";
            }
            if (robotsResp.text.includes("Disallow: /")) {
              const lines = robotsResp.text.split("\n");
              const disallowAll = lines.some((l: string) => l.trim() === "Disallow: /");
              if (disallowAll) seoWarnings.push("⚠️ robots.txt contains 'Disallow: /' — entire site may be blocked from crawling");
            }
          } else {
            robotsTxtNote = `robots.txt returned status ${robotsResp.status}`;
          }
        } catch {
          robotsTxtNote = "Could not check robots.txt";
        }

        // Cross-page duplicate detection within the same browser session
        if (!session.seoAuditHistory) session.seoAuditHistory = [];
        const prevAudits = session.seoAuditHistory;
        for (const prev of prevAudits) {
          if (prev.url === seo.url) continue;
          if (seo.title && prev.title === seo.title) {
            seoWarnings.push(`⚠️ DUPLICATE TITLE: identical to previously audited page ${prev.url}`);
          }
          if (seo.metaDescription && prev.description === seo.metaDescription) {
            seoWarnings.push(`⚠️ DUPLICATE DESCRIPTION: identical to previously audited page ${prev.url}`);
          }
          if (seo.og.title && prev.ogTitle === seo.og.title) {
            seoWarnings.push(`⚠️ DUPLICATE og:title: identical to previously audited page ${prev.url}`);
          }
          if (seo.og.description && prev.ogDescription === seo.og.description) {
            seoWarnings.push(`⚠️ DUPLICATE og:description: identical to previously audited page ${prev.url}`);
          }
          if (seo.og.image && prev.ogImage === seo.og.image) {
            seoWarnings.push(`⚠️ DUPLICATE og:image: same image as previously audited page ${prev.url}`);
          }
        }
        // Store this audit for future cross-page checks
        session.seoAuditHistory.push({
          url: seo.url,
          title: seo.title,
          description: seo.metaDescription,
          canonical: seo.canonical,
          ogTitle: seo.og.title,
          ogDescription: seo.og.description,
          ogImage: seo.og.image,
        });

        const lines = [
          `SEO Audit: ${seo.url}`,
          ``,
          // Semantic warnings at the top for visibility
          ...(seoWarnings.length > 0 ? [`## ⚠️ Critical Warnings`, ...seoWarnings, ``] : []),
          `Title: ${seo.title || "MISSING"} (${seo.titleLength} chars${seo.titleLength > 60 ? " ⚠️ too long" : seo.titleLength < 30 ? " ⚠️ too short" : " ✓"})`,
          `Description: ${seo.metaDescription?.slice(0, 100) || "MISSING"} (${seo.metaDescriptionLength} chars${seo.metaDescriptionLength > 160 ? " ⚠️ too long" : seo.metaDescriptionLength < 50 ? " ⚠️ too short" : " ✓"})`,
          `Canonical: ${seo.canonical || "MISSING"}`,
          `Robots: ${seo.robots || "not set"}`,
          `Language: ${seo.lang || "MISSING"}`,
          `Viewport: ${seo.viewport || "MISSING"}`,
          ...(robotsTxtNote ? [`robots.txt: ${robotsTxtNote}`] : []),
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
          ``,
          `Structured Data: ${structuredDataSummary}`,
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
        const before = await captureBefore(session.page);
        await session.page.keyboard.press(args.key);
        await session.page.waitForTimeout(300);
        const img = await pageScreenshot(session.page, { toolName: "browser_press_key", arg: args.key, ...before });
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
    "Attempt to log in to a website. Navigates to the login URL, finds email/username and password fields, fills them in, and submits the form with click, Enter, and form-submit fallbacks for Clerk and other multi-step auth UIs. Returns a screenshot and reports whether login succeeded, failed, or needs verification. Always ask the user for credentials first — never guess. If the site requires email verification (OTP code), use read_verification_email to automatically fetch the code from Gmail (requires one-time authorize_email_access setup). ESCALATION: if smart_login returns UNCERTAIN or the page silently refuses to advance after a valid-looking submit (common on WorkOS AuthKit / Cloudflare Turnstile / Clerk bot-detection), do NOT retry. Escalate to the CLI local browser: `npx screenshotsmcp browser:start <url>` and drive real Chrome one atomic command at a time. Real Chrome on the user's residential IP passes trust checks the Railway-hosted cloud browser cannot.",
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
        const origin = normalizeOrigin(args.loginUrl);
        const primaryInbox = await getPrimaryInbox(authResult.userId);
        // Create a new session and navigate — record by default so login
        // attempts always produce a replayable .webm for audit.
        const sessionId = await createSession(authResult.userId, undefined, true);
        const session = await getSession(sessionId, authResult.userId);
        if (!session) return { content: [{ type: "text", text: "Failed to create browser session." }] };
        const page = session.page;
        const authSignals: string[] = [];

        const recordAuthSignal = (status: number, url: string) => {
          const normalized = url.toLowerCase();
          if (/(clerk|sign[-_]?in|factor-two|verification|verify|session|authenticate|otp)/.test(normalized)) {
            authSignals.push(`${status} ${url}`);
          }
        };

        page.on("response", (response) => {
          recordAuthSignal(response.status(), response.url());
        });

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

        const fillWithFallback = async (selector: string, value: string) => {
          const locator = page.locator(selector).first();
          await locator.waitFor({ state: "visible", timeout: 5000 }).catch(() => null);

          try {
            await locator.click({ timeout: 2000 });
          } catch {}

          try {
            await locator.fill(value, { timeout: 4000 });
          } catch {
            await page.evaluate(
              ({ selector: targetSelector, nextValue }) => {
                const el = document.querySelector(targetSelector) as any;
                if (!el) {
                  return;
                }

                el.focus();
                el.value = nextValue;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
              },
              { selector, nextValue: value },
            );
          }

          await page.waitForTimeout(250);
        };

        // Fill in credentials
        await fillWithFallback(usernameSelector as string, args.username);
        await fillWithFallback(passwordSelector as string, args.password);

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

        const submitWithFallback = async () => {
          if (submitSelector) {
            try {
              await page.click(submitSelector as string, { timeout: 2500 });
              return;
            } catch {}
          }

          try {
            await page.keyboard.press("Enter");
            return;
          } catch {}

          await page.evaluate(({ usernameField, passwordField }) => {
            const passwordInput = document.querySelector(passwordField) as any;
            const usernameInput = document.querySelector(usernameField) as any;
            const form = passwordInput?.form || usernameInput?.form || document.querySelector("form");
            if (form && typeof form.requestSubmit === "function") {
              form.requestSubmit();
            } else if (form) {
              form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            }
          }, {
            usernameField: usernameSelector as string,
            passwordField: passwordSelector as string,
          });
        };

        await submitWithFallback();

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

        const verificationRequested = await page.evaluate(`
          (() => {
            const body = (document.body && document.body.innerText || "").toLowerCase();
            const patterns = [
              "verification code", "check your email", "one-time code", "otp",
              "enter the code", "verify your email", "two-factor", "2fa",
            ];
            return patterns.some(p => body.includes(p)) || /factor-two|verify|verification/.test(window.location.pathname.toLowerCase());
          })()
        `);

        const stillOnLogin = /\b(login|signin|sign-in|sign_in|auth|log-in)\b/i.test(currentUrl);

        const img = await pageScreenshot(page);

        if (loginFailed) {
          await upsertWebsiteAuthMemory({
            userId: authResult.userId,
            origin,
            inboxId: primaryInbox?.id ?? null,
            inboxEmail: primaryInbox?.email ?? null,
            loginUrl: args.loginUrl,
            outcome: "login_failed",
            notes: `smart_login failed at ${currentUrl}`,
          });
          return {
            content: [
              { type: "text", text: `Login FAILED at ${currentUrl}\n\nThe page shows an error message indicating invalid credentials.\n\nSession ID: ${sessionId} (session kept open for retry)\n\nOptions:\n1. Ask the user to double-check their credentials\n2. Ask for the exact login URL if this was the wrong page\n3. Use browser_fill manually if the form is non-standard` },
              img,
            ],
          };
        }

        if (verificationRequested) {
          await upsertWebsiteAuthMemory({
            userId: authResult.userId,
            origin,
            inboxId: primaryInbox?.id ?? null,
            inboxEmail: primaryInbox?.email ?? null,
            loginUrl: args.loginUrl,
            outcome: "verification_required",
            verificationRequired: true,
            notes: `smart_login reached a verification step at ${currentUrl}`,
          });

          return {
            content: [
              { type: "text", text: `Verification required at ${currentUrl}\n\nThe page appears to be asking for an email code or verification step.\n\nSession ID: ${sessionId} (session kept open)\n\nNext steps:\n1. Use **check_inbox** with ${primaryInbox?.email ?? "the saved inbox"} to read the OTP or verification link\n2. Continue with browser_fill or browser_click\n3. After verification succeeds, call **auth_test_assist** with action: \"record\" and outcome: \"verification_success\"` },
              img,
            ],
          };
        }

        if (stillOnLogin && currentUrl === args.loginUrl) {
          await upsertWebsiteAuthMemory({
            userId: authResult.userId,
            origin,
            inboxId: primaryInbox?.id ?? null,
            inboxEmail: primaryInbox?.email ?? null,
            loginUrl: args.loginUrl,
            notes: `smart_login was uncertain at ${currentUrl}`,
          });
          return {
            content: [
              { type: "text", text: `Login UNCERTAIN — still on ${currentUrl}\n\nThe page didn't navigate away after submission. This could mean:\n- Credentials were wrong but no visible error\n- The form requires additional steps (2FA, captcha)\n- The submit button wasn't clicked correctly\n- The page submitted in the background but the UI did not advance yet\n\nAuth network signals: ${authSignals.length > 0 ? authSignals.slice(-5).join(" | ") : "none captured"}\n\nSession ID: ${sessionId} (session kept open)\n\nRecommended next steps:\n1. Inspect **browser_network_requests** and **browser_console_logs**\n2. Try **browser_press_key** with Enter or **browser_evaluate** with form.requestSubmit()\n3. If the page is Clerk-based, inspect whether it moved to factor-two or verification without obvious UI changes\n4. Record the outcome with **auth_test_assist** once you confirm what happened.` },
              img,
            ],
          };
        }

        await upsertWebsiteAuthMemory({
          userId: authResult.userId,
          origin,
          inboxId: primaryInbox?.id ?? null,
          inboxEmail: primaryInbox?.email ?? null,
          loginUrl: args.loginUrl,
          outcome: "login_success",
          notes: `smart_login succeeded at ${currentUrl}`,
        });

        return {
          content: [
            { type: "text", text: `Login SUCCESS! Redirected to: ${currentUrl}\n\nSession ID: ${sessionId}\n\nYou can now use this session to continue testing the authenticated flow. Use browser_click, browser_fill, browser_navigate, etc. with this session ID.\n\nThis successful sign-in was saved to the site's auth memory for future runs. Remember to call browser_close when done.` },
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
    "Get the raw accessibility tree for any URL without needing a browser session. Returns a structured snapshot of interactive elements, headings, links, buttons, form fields, and ARIA roles. For a real WCAG compliance audit with pass/fail results, use the accessibility_audit tool instead.",
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

  // ── Accessibility Audit (real WCAG checks) ───────────────────
  // @ts-ignore - TS2589
  server.tool(
    "accessibility_audit",
    "Run a real WCAG 2.1 AA compliance audit on a URL. Checks landmarks, skip links, focus indicators, heading hierarchy, image alt text, aria-hidden on decorative SVGs, color contrast ratios, form labels, touch targets, and reduced-motion handling. Returns categorized PASS/FAIL results with WCAG criteria references — not a raw tree dump.",
    {
      url: z.string().url().describe("URL to audit"),
      width: z.number().int().min(320).max(3840).default(1280).describe("Viewport width"),
      height: z.number().int().min(240).max(2160).default(800).describe("Viewport height"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };

      const { browser, release } = await browserPool.acquire();
      let context;
      try {
        context = await browser.newContext({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          viewport: { width: args.width, height: args.height },
          locale: "en-US",
        });
        const page = await context.newPage();
        try {
          await page.goto(args.url, { waitUntil: "networkidle", timeout: 30000 });
        } catch {
          await page.goto(args.url, { waitUntil: "load", timeout: 30000 });
        }
        await page.waitForTimeout(1500);

        const audit = await page.evaluate(() => {
          const doc = (globalThis as any).document;
          const results: { id: string; wcag: string; severity: "critical" | "serious" | "moderate" | "minor"; status: "FAIL" | "PASS" | "WARN"; message: string }[] = [];

          // 1.3.1 — Landmarks
          const hasMain = !!doc.querySelector("main");
          results.push({ id: "landmark-main", wcag: "1.3.1", severity: "critical", status: hasMain ? "PASS" : "FAIL", message: hasMain ? "<main> landmark present" : "No <main> landmark found — screen reader users cannot jump to primary content" });
          const hasHeader = !!doc.querySelector("header, [role='banner']");
          results.push({ id: "landmark-header", wcag: "1.3.1", severity: "serious", status: hasHeader ? "PASS" : "FAIL", message: hasHeader ? "<header>/banner landmark present" : "No <header> or role='banner' found" });
          const hasNav = !!doc.querySelector("nav, [role='navigation']");
          results.push({ id: "landmark-nav", wcag: "1.3.1", severity: "serious", status: hasNav ? "PASS" : "FAIL", message: hasNav ? "<nav> landmark present" : "No <nav> or role='navigation' found" });
          const hasFooter = !!doc.querySelector("footer, [role='contentinfo']");
          results.push({ id: "landmark-footer", wcag: "1.3.1", severity: "minor", status: hasFooter ? "PASS" : "FAIL", message: hasFooter ? "<footer>/contentinfo landmark present" : "No <footer> found" });

          // 2.4.1 — Skip link
          const skipLink = doc.querySelector("a[href='#main'], a[href='#content'], a[href='#main-content']");
          results.push({ id: "skip-link", wcag: "2.4.1", severity: "critical", status: skipLink ? "PASS" : "FAIL", message: skipLink ? "Skip-to-content link present" : "No skip-to-content link found — keyboard users must tab through all nav on every page" });

          // 2.4.2 — Page title
          const title = doc.title;
          results.push({ id: "page-title", wcag: "2.4.2", severity: "serious", status: title ? "PASS" : "FAIL", message: title ? `Page title: "${title.slice(0, 60)}"` : "No <title> element" });

          // 1.3.1 — Heading hierarchy
          const headings: { level: number; text: string }[] = [];
          doc.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h: any) => {
            headings.push({ level: parseInt(h.tagName[1]), text: (h.textContent || "").trim().slice(0, 60) });
          });
          const h1Count = headings.filter(h => h.level === 1).length;
          results.push({ id: "heading-h1", wcag: "1.3.1", severity: "serious", status: h1Count === 1 ? "PASS" : "FAIL", message: h1Count === 1 ? "Single H1 present" : `Found ${h1Count} H1 elements (expected 1)` });
          let skipDetected = false;
          for (let i = 1; i < headings.length; i++) {
            if (headings[i].level > headings[i - 1].level + 1) { skipDetected = true; break; }
          }
          results.push({ id: "heading-order", wcag: "1.3.1", severity: "moderate", status: skipDetected ? "WARN" : "PASS", message: skipDetected ? "Heading level skip detected (e.g. H2 → H4)" : `Heading hierarchy OK (${headings.length} headings)` });

          // 1.1.1 — Images missing alt
          const imgs = doc.querySelectorAll("img");
          const imgsMissingAlt = Array.from(imgs).filter((img: any) => !img.hasAttribute("alt"));
          if (imgs.length > 0) {
            results.push({ id: "img-alt", wcag: "1.1.1", severity: "critical", status: imgsMissingAlt.length === 0 ? "PASS" : "FAIL", message: imgsMissingAlt.length === 0 ? `All ${imgs.length} images have alt attributes` : `${imgsMissingAlt.length} of ${imgs.length} images missing alt attribute` });
          } else {
            results.push({ id: "img-alt", wcag: "1.1.1", severity: "critical", status: "PASS", message: "No <img> elements on page (0 to check)" });
          }

          // 1.1.1 — Decorative SVGs without aria-hidden
          const svgs = doc.querySelectorAll("svg");
          const svgsExposed = Array.from(svgs).filter((svg: any) => svg.getAttribute("aria-hidden") !== "true" && !svg.getAttribute("role") && !svg.getAttribute("aria-label"));
          results.push({ id: "svg-aria", wcag: "1.1.1", severity: "serious", status: svgsExposed.length === 0 ? "PASS" : "FAIL", message: svgsExposed.length === 0 ? `All ${svgs.length} SVGs properly hidden or labelled` : `${svgsExposed.length} of ${svgs.length} SVGs exposed to assistive tech without aria-hidden or aria-label` });

          // 2.4.7 — Focus indicators
          const focusable = doc.querySelectorAll("a[href], button, input, textarea, select, [tabindex]:not([tabindex='-1'])");
          let noFocusIndicator = 0;
          Array.from(focusable).slice(0, 50).forEach((el: any) => {
            const styles = (globalThis as any).getComputedStyle(el);
            const outlineStyle = styles.outlineStyle;
            const outlineWidth = parseFloat(styles.outlineWidth);
            if (outlineStyle === "none" || outlineWidth === 0) {
              // Check if there's a box-shadow or border that could serve as indicator
              const boxShadow = styles.boxShadow;
              if (!boxShadow || boxShadow === "none") noFocusIndicator++;
            }
          });
          const focusTotal = focusable.length;
          results.push({ id: "focus-visible", wcag: "2.4.7", severity: "critical", status: noFocusIndicator === 0 ? "PASS" : noFocusIndicator < focusTotal * 0.2 ? "WARN" : "FAIL", message: noFocusIndicator === 0 ? `All ${focusTotal} focusable elements have visible focus styles` : `${noFocusIndicator} of ${focusTotal} focusable elements may lack visible focus indicators (checked default styles, not :focus-visible)` });

          // 1.4.3 — Color contrast (sample text elements)
          const contrastIssues: string[] = [];
          function luminance(r: number, g: number, b: number) {
            const [rs, gs, bs] = [r, g, b].map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
          }
          function contrastRatio(l1: number, l2: number) {
            const lighter = Math.max(l1, l2);
            const darker = Math.min(l1, l2);
            return (lighter + 0.05) / (darker + 0.05);
          }
          function parseColor(color: string): [number, number, number] | null {
            const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
            return null;
          }
          const textEls = doc.querySelectorAll("p, span, li, td, th, label, a, button, h1, h2, h3, h4, h5, h6");
          let contrastChecked = 0;
          let contrastFails = 0;
          Array.from(textEls).slice(0, 100).forEach((el: any) => {
            const styles = (globalThis as any).getComputedStyle(el);
            const fg = parseColor(styles.color);
            const bg = parseColor(styles.backgroundColor);
            if (!fg || !bg) return;
            // Skip transparent bg
            const bgAlpha = styles.backgroundColor.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
            if (bgAlpha && parseFloat(bgAlpha[1]) < 0.1) return;
            contrastChecked++;
            const fgL = luminance(fg[0], fg[1], fg[2]);
            const bgL = luminance(bg[0], bg[1], bg[2]);
            const ratio = contrastRatio(fgL, bgL);
            const fontSize = parseFloat(styles.fontSize);
            const fontWeight = parseInt(styles.fontWeight) || 400;
            const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
            const minRatio = isLargeText ? 3 : 4.5;
            if (ratio < minRatio) {
              contrastFails++;
              const text = (el.textContent || "").trim().slice(0, 40);
              if (contrastIssues.length < 5) {
                contrastIssues.push(`"${text}" — ratio ${ratio.toFixed(1)}:1 (need ${minRatio}:1) fg:rgb(${fg}) bg:rgb(${bg})`);
              }
            }
          });
          results.push({ id: "color-contrast", wcag: "1.4.3", severity: "critical", status: contrastFails === 0 ? "PASS" : "FAIL", message: contrastFails === 0 ? `${contrastChecked} text elements checked — all pass contrast minimum` : `${contrastFails} of ${contrastChecked} sampled text elements fail contrast (${contrastIssues.join("; ")})` });

          // 4.1.2 — Form labels
          const inputs = doc.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select");
          let unlabelled = 0;
          inputs.forEach((input: any) => {
            const hasLabel = input.id && doc.querySelector(`label[for="${input.id}"]`);
            const hasAriaLabel = input.getAttribute("aria-label") || input.getAttribute("aria-labelledby");
            const wrappedInLabel = input.closest("label");
            const hasPlaceholder = input.getAttribute("placeholder");
            if (!hasLabel && !hasAriaLabel && !wrappedInLabel && !hasPlaceholder) unlabelled++;
          });
          if (inputs.length > 0) {
            results.push({ id: "form-labels", wcag: "4.1.2", severity: "critical", status: unlabelled === 0 ? "PASS" : "FAIL", message: unlabelled === 0 ? `All ${inputs.length} form inputs have labels` : `${unlabelled} of ${inputs.length} form inputs have no label, aria-label, or placeholder` });
          }

          // 1.3.1 — Language attribute
          const lang = doc.documentElement.getAttribute("lang");
          results.push({ id: "html-lang", wcag: "3.1.1", severity: "serious", status: lang ? "PASS" : "FAIL", message: lang ? `lang="${lang}" set on <html>` : "No lang attribute on <html>" });

          // 2.3.3 — Reduced motion
          let hasReducedMotion = false;
          try {
            for (const sheet of doc.styleSheets) {
              try {
                for (const rule of sheet.cssRules) {
                  if (rule.media && rule.media.mediaText && rule.media.mediaText.includes("prefers-reduced-motion")) { hasReducedMotion = true; break; }
                }
              } catch { /* cross-origin stylesheet */ }
              if (hasReducedMotion) break;
            }
          } catch {}
          const hasAnimations = doc.querySelectorAll("[class*='animate-'], [class*='transition']").length;
          if (hasAnimations > 0) {
            results.push({ id: "reduced-motion", wcag: "2.3.3", severity: "moderate", status: hasReducedMotion ? "PASS" : "WARN", message: hasReducedMotion ? `prefers-reduced-motion rule found (${hasAnimations} animated elements)` : `${hasAnimations} animated elements but no prefers-reduced-motion CSS rule detected` });
          }

          // Summary counts
          const fails = results.filter(r => r.status === "FAIL");
          const warns = results.filter(r => r.status === "WARN");
          const passes = results.filter(r => r.status === "PASS");

          return { results, fails: fails.length, warns: warns.length, passes: passes.length, total: results.length, headingSummary: headings.map(h => `${"  ".repeat(h.level - 1)}H${h.level}: ${h.text}`) };
        });

        const lines = [
          `# Accessibility Audit — ${args.url}`,
          `Viewport: ${args.width}×${args.height}`,
          ``,
          `## Summary: ${audit.fails} failures, ${audit.warns} warnings, ${audit.passes} passes (${audit.total} checks)`,
          `WCAG 2.1 AA Compliance: ${audit.fails === 0 ? "✅ PASS" : "❌ FAIL"}`,
          ``,
        ];

        if (audit.fails > 0) {
          lines.push(`## ❌ Failures`);
          audit.results.filter((r: any) => r.status === "FAIL").forEach((r: any) => {
            lines.push(`  [${r.severity.toUpperCase()}] WCAG ${r.wcag} — ${r.message}`);
          });
          lines.push(``);
        }
        if (audit.warns > 0) {
          lines.push(`## ⚠️ Warnings`);
          audit.results.filter((r: any) => r.status === "WARN").forEach((r: any) => {
            lines.push(`  [${r.severity.toUpperCase()}] WCAG ${r.wcag} — ${r.message}`);
          });
          lines.push(``);
        }
        lines.push(`## ✅ Passes`);
        audit.results.filter((r: any) => r.status === "PASS").forEach((r: any) => {
          lines.push(`  WCAG ${r.wcag} — ${r.message}`);
        });
        lines.push(``);
        lines.push(`## Heading Hierarchy`);
        audit.headingSummary.forEach((h: string) => lines.push(`  ${h}`));

        return { content: [{ type: "text", text: lines.join("\n") }] };
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

      const { browser, release } = await browserPool.acquire();
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

  // ── Webhooks ─────────────────────────────────────────────────
  // Operate against the webhook_endpoints / webhook_deliveries tables
  // directly so AI agents can configure delivery destinations without
  // needing to leave the MCP session for the REST surface.

  server.tool(
    "webhook_list",
    "List all outbound webhook endpoints registered for the current account. Use this to confirm which URLs will receive screenshot.completed, run.completed, run.failed, and quota.warning events.",
    {},
    async () => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.userId, auth.userId))
        .orderBy(desc(webhookEndpoints.createdAt));
      if (rows.length === 0) {
        return { content: [{ type: "text", text: "No webhook endpoints configured. Use `webhook_create` to add one." }] };
      }
      const lines = rows.map((r) =>
        `• ${r.id} — ${r.url} ${r.enabled ? "(enabled)" : "(paused)"} events=[${r.events.join(", ")}] last_delivered=${r.lastDeliveredAt?.toISOString() ?? "never"}`,
      );
      return { content: [{ type: "text", text: `${rows.length} endpoint${rows.length === 1 ? "" : "s"}:\n${lines.join("\n")}` }] };
    },
  );

  server.tool(
    "webhook_create",
    "Register a new outbound webhook endpoint. The signing secret is returned ONCE — store it before doing anything else. Default events=['*'] subscribes to every event type. Available events: screenshot.completed, screenshot.failed, run.completed, run.failed, quota.warning, test.ping.",
    {
      url: z.string().url().describe("HTTPS URL that will receive POST requests"),
      events: z.array(z.string()).optional().describe("Event types to subscribe to. Default ['*'] = all events."),
      description: z.string().max(280).optional().describe("Optional human-readable description"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const id = nanoid();
      const secret = `whsec_${randomBytes(32).toString("base64url")}`;
      await db.insert(webhookEndpoints).values({
        id,
        userId: auth.userId,
        url: args.url,
        secret,
        events: args.events && args.events.length > 0 ? args.events : ["*"],
        description: args.description ?? null,
      });
      return {
        content: [{
          type: "text",
          text: [
            `Webhook endpoint created.`,
            ``,
            `id:     ${id}`,
            `url:    ${args.url}`,
            `events: ${(args.events ?? ["*"]).join(", ")}`,
            ``,
            `Signing secret (shown ONCE — save it now):`,
            `  ${secret}`,
            ``,
            `Verify deliveries with HMAC-SHA256("${"${ts}.${rawBody}"}", secret) and compare against the v1=... portion of the Webhook-Signature header.`,
          ].join("\n"),
        }],
      };
    },
  );

  server.tool(
    "webhook_test",
    "Fire a test.ping event to a webhook endpoint to verify reachability and signature handling. Returns once the delivery has been enqueued — inspect with webhook_deliveries shortly after.",
    { endpointId: z.string().describe("Endpoint id from webhook_list / webhook_create") },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const [row] = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, args.endpointId), eq(webhookEndpoints.userId, auth.userId)));
      if (!row) return { content: [{ type: "text", text: `Error: endpoint ${args.endpointId} not found.` }] };
      // Temporarily allow test.ping if the endpoint is filtered to specific events.
      const wasFiltered = !row.events.includes("*") && !row.events.includes("test.ping");
      if (wasFiltered) {
        await db.update(webhookEndpoints).set({ events: [...row.events, "test.ping"], updatedAt: new Date() }).where(eq(webhookEndpoints.id, row.id));
      }
      await emitWebhookEvent({
        userId: auth.userId,
        eventType: "test.ping",
        payload: { endpointId: row.id, message: "Hello from ScreenshotsMCP" },
      });
      if (wasFiltered) {
        await db.update(webhookEndpoints).set({ events: row.events, updatedAt: new Date() }).where(eq(webhookEndpoints.id, row.id));
      }
      return { content: [{ type: "text", text: `Test ping enqueued to ${row.url}. Use webhook_deliveries to inspect status.` }] };
    },
  );

  server.tool(
    "webhook_rotate",
    "Rotate the signing secret for an endpoint. The new secret is returned once — update your verifier immediately to avoid signature mismatches.",
    { endpointId: z.string().describe("Endpoint id to rotate") },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const secret = `whsec_${randomBytes(32).toString("base64url")}`;
      const [row] = await db
        .update(webhookEndpoints)
        .set({ secret, updatedAt: new Date() })
        .where(and(eq(webhookEndpoints.id, args.endpointId), eq(webhookEndpoints.userId, auth.userId)))
        .returning();
      if (!row) return { content: [{ type: "text", text: `Error: endpoint ${args.endpointId} not found.` }] };
      return { content: [{ type: "text", text: `New signing secret for ${row.url}:\n  ${secret}\n\nThis is the only time it will be displayed.` }] };
    },
  );

  server.tool(
    "webhook_deliveries",
    "List the most recent delivery attempts for a webhook endpoint, including HTTP status, attempt count, and any error message. Use after a test.ping or when debugging customer-reported missed events.",
    {
      endpointId: z.string().describe("Endpoint id"),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximum rows to return"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const [endpoint] = await db
        .select({ id: webhookEndpoints.id })
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, args.endpointId), eq(webhookEndpoints.userId, auth.userId)));
      if (!endpoint) return { content: [{ type: "text", text: `Error: endpoint ${args.endpointId} not found.` }] };
      const rows = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.endpointId, args.endpointId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(args.limit);
      if (rows.length === 0) return { content: [{ type: "text", text: "No deliveries yet." }] };
      const lines = rows.map((d) =>
        `• ${d.createdAt.toISOString()} ${d.eventType} → ${d.status}${d.responseCode ? ` (HTTP ${d.responseCode})` : ""} attempt=${d.attempt}${d.errorMessage ? ` err="${d.errorMessage}"` : ""}`,
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.tool(
    "webhook_delete",
    "Permanently delete a webhook endpoint and stop sending events to it. Existing in-flight deliveries are not retried.",
    { endpointId: z.string().describe("Endpoint id to delete") },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const [row] = await db
        .delete(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, args.endpointId), eq(webhookEndpoints.userId, auth.userId)))
        .returning({ id: webhookEndpoints.id, url: webhookEndpoints.url });
      if (!row) return { content: [{ type: "text", text: `Error: endpoint ${args.endpointId} not found.` }] };
      return { content: [{ type: "text", text: `Deleted endpoint ${row.id} (${row.url}).` }] };
    },
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
    "Detect responsive layout breakpoints for a URL. Scans 23 viewport widths from 320px to 1920px and returns a structured width table showing height, scrollWidth, and overflow status (✅/❌) at each width. Also identifies significant layout shifts (>15% height change) and extracts CSS @media breakpoints from stylesheets.",
    {
      url: z.string().url().describe("The URL to analyze"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };

      const { browser, release } = await browserPool.acquire();
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

        // Build structured width table
        const widthTable = measurements.map((m) => {
          const overflow = m.scrollWidth > m.width;
          return `  ${String(m.width).padStart(5)}px | height: ${String(m.bodyHeight).padStart(6)}px | scrollWidth: ${String(m.scrollWidth).padStart(5)}px | ${overflow ? `❌ OVERFLOW (+${m.scrollWidth - m.width}px)` : "✅ OK"}`;
        });

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
              `Width Table:`,
              ...widthTable,
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

  // ── Responsive Audit ──────────────────────────────────────
  server.tool(
    "responsive_audit",
    "Run a comprehensive responsive design audit on a browser session. Detects horizontal overflow and identifies culprit elements, checks touch target sizes (≥44×44px), finds text below 16px, verifies viewport meta tag, checks input font sizes for zoom prevention, and reports interactive element spacing. Returns a structured pass/fail report. Must have an active browser session.",
    {
      sessionId: z.string().describe("Session ID from browser_navigate"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
      const session = await getSession(args.sessionId, auth.userId);
      if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };

      try {
        const audit = await session.page.evaluate(() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const bodyScrollW = document.body.scrollWidth;
          const hasOverflow = bodyScrollW > vw;

          // 1. Overflow culprits
          const overflowCulprits: { tag: string; cls: string; right: number; width: number; text: string }[] = [];
          if (hasOverflow) {
            const all = document.querySelectorAll("*");
            for (let i = 0; i < all.length; i++) {
              const el = all[i] as HTMLElement;
              const rect = el.getBoundingClientRect();
              if (rect.right > vw + 2 && rect.width > 0) {
                const tag = el.tagName;
                if (tag === "HTML" || tag === "BODY") continue;
                overflowCulprits.push({
                  tag,
                  cls: el.className?.toString?.()?.slice(0, 80) || "",
                  right: Math.round(rect.right),
                  width: Math.round(rect.width),
                  text: el.textContent?.trim()?.slice(0, 40) || "",
                });
              }
            }
            overflowCulprits.sort((a, b) => b.right - a.right);
            overflowCulprits.splice(15);
          }

          // 2. Touch targets (interactive elements < 44x44)
          const smallTargets: { tag: string; text: string; w: number; h: number }[] = [];
          const interactive = document.querySelectorAll("a, button, input, select, textarea, [role='button'], [tabindex]");
          for (let i = 0; i < interactive.length; i++) {
            const el = interactive[i] as HTMLElement;
            const style = getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden") continue;
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
              smallTargets.push({
                tag: el.tagName,
                text: (el.textContent?.trim() || el.getAttribute("aria-label") || "")?.slice(0, 30),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
              });
            }
          }
          smallTargets.splice(15);

          // 3. Small text (< 16px)
          const smallText: { tag: string; fontSize: string; text: string }[] = [];
          const textEls = document.querySelectorAll("p, span, a, li, td, th, label, div");
          for (let i = 0; i < textEls.length; i++) {
            const el = textEls[i] as HTMLElement;
            const style = getComputedStyle(el);
            if (style.display === "none") continue;
            const fs = parseFloat(style.fontSize);
            if (fs > 0 && fs < 16 && el.textContent?.trim()) {
              const existing = smallText.find(s => s.fontSize === style.fontSize);
              if (!existing) {
                smallText.push({
                  tag: el.tagName,
                  fontSize: style.fontSize,
                  text: el.textContent.trim().slice(0, 40),
                });
              }
            }
          }
          smallText.splice(10);

          // 4. Viewport meta tag
          const viewportMeta = document.querySelector('meta[name="viewport"]')?.getAttribute("content") || null;

          // 5. Input font sizes (< 16px causes zoom on iOS)
          const inputsWithSmallFont: { type: string; fontSize: string; name: string }[] = [];
          const inputs = document.querySelectorAll("input, textarea, select");
          for (let i = 0; i < inputs.length; i++) {
            const el = inputs[i] as HTMLInputElement;
            const fs = parseFloat(getComputedStyle(el).fontSize);
            if (fs > 0 && fs < 16) {
              inputsWithSmallFont.push({
                type: el.type || el.tagName.toLowerCase(),
                fontSize: getComputedStyle(el).fontSize,
                name: el.name || el.id || "",
              });
            }
          }

          // 6. Closely spaced interactive elements
          const tooClose: { el1: string; el2: string; gap: number }[] = [];
          const interactiveArr = Array.from(interactive) as HTMLElement[];
          for (let i = 0; i < Math.min(interactiveArr.length, 50); i++) {
            const a = interactiveArr[i];
            const rectA = a.getBoundingClientRect();
            if (rectA.width === 0 || rectA.height === 0) continue;
            for (let j = i + 1; j < Math.min(interactiveArr.length, 50); j++) {
              const b = interactiveArr[j];
              const rectB = b.getBoundingClientRect();
              if (rectB.width === 0 || rectB.height === 0) continue;
              const gapX = Math.max(0, Math.max(rectA.left, rectB.left) - Math.min(rectA.right, rectB.right));
              const gapY = Math.max(0, Math.max(rectA.top, rectB.top) - Math.min(rectA.bottom, rectB.bottom));
              const gap = Math.min(gapX, gapY);
              if (gap >= 0 && gap < 8 && gapX + gapY < 16) {
                tooClose.push({
                  el1: (a.textContent?.trim()?.slice(0, 20) || a.tagName),
                  el2: (b.textContent?.trim()?.slice(0, 20) || b.tagName),
                  gap: Math.round(Math.max(gapX, gapY)),
                });
                if (tooClose.length >= 10) break;
              }
            }
            if (tooClose.length >= 10) break;
          }

          return {
            viewport: { width: vw, height: vh },
            overflow: { hasOverflow, bodyScrollWidth: bodyScrollW, overflowAmount: bodyScrollW - vw, culprits: overflowCulprits },
            touchTargets: { total: interactive.length, tooSmall: smallTargets.length, items: smallTargets },
            textSize: { belowMinimum: smallText.length, items: smallText },
            viewportMeta,
            inputZoom: { riskyInputs: inputsWithSmallFont.length, items: inputsWithSmallFont },
            spacing: { tooClose: tooClose.length, items: tooClose },
          };
        });

        // Build report
        const lines: string[] = [];
        lines.push(`Responsive Audit — ${await session.page.url()}`);
        lines.push(`Viewport: ${audit.viewport.width}×${audit.viewport.height}`);
        lines.push(``);

        // Overflow
        if (audit.overflow.hasOverflow) {
          lines.push(`❌ HORIZONTAL OVERFLOW: body is ${audit.overflow.bodyScrollWidth}px (${audit.overflow.overflowAmount}px wider than viewport)`);
          lines.push(`   Culprit elements (${audit.overflow.culprits.length}):`);
          for (const c of audit.overflow.culprits) {
            lines.push(`     ${c.tag} .${c.cls.split(" ")[0] || "(no class)"} — extends to ${c.right}px (${c.right - audit.viewport.width}px past viewport) "${c.text}"`);
          }
        } else {
          lines.push(`✅ No horizontal overflow`);
        }
        lines.push(``);

        // Touch targets
        if (audit.touchTargets.tooSmall > 0) {
          lines.push(`⚠️ TOUCH TARGETS: ${audit.touchTargets.tooSmall} of ${audit.touchTargets.total} interactive elements below 44×44px minimum`);
          for (const t of audit.touchTargets.items) {
            lines.push(`     ${t.tag} "${t.text}" — ${t.w}×${t.h}px`);
          }
        } else {
          lines.push(`✅ All ${audit.touchTargets.total} interactive elements meet 44×44px touch target minimum`);
        }
        lines.push(``);

        // Text size
        if (audit.textSize.belowMinimum > 0) {
          lines.push(`⚠️ SMALL TEXT: ${audit.textSize.belowMinimum} text size(s) below 16px`);
          for (const t of audit.textSize.items) {
            lines.push(`     ${t.tag} at ${t.fontSize} — "${t.text}"`);
          }
        } else {
          lines.push(`✅ All text ≥ 16px`);
        }
        lines.push(``);

        // Viewport meta
        if (audit.viewportMeta) {
          const hasWidthDevice = audit.viewportMeta.includes("width=device-width");
          const hasInitialScale = audit.viewportMeta.includes("initial-scale=1");
          if (hasWidthDevice && hasInitialScale) {
            lines.push(`✅ Viewport meta: ${audit.viewportMeta}`);
          } else {
            lines.push(`⚠️ Viewport meta may be incomplete: ${audit.viewportMeta}`);
            if (!hasWidthDevice) lines.push(`     Missing: width=device-width`);
            if (!hasInitialScale) lines.push(`     Missing: initial-scale=1`);
          }
        } else {
          lines.push(`❌ NO VIEWPORT META TAG — page will not render correctly on mobile`);
        }
        lines.push(``);

        // Input zoom
        if (audit.inputZoom.riskyInputs > 0) {
          lines.push(`⚠️ INPUT ZOOM RISK: ${audit.inputZoom.riskyInputs} input(s) with font-size < 16px (causes auto-zoom on iOS)`);
          for (const inp of audit.inputZoom.items) {
            lines.push(`     ${inp.type} "${inp.name}" at ${inp.fontSize}`);
          }
        } else if (audit.inputZoom.riskyInputs === 0) {
          const hasInputs = audit.touchTargets.total > 0;
          lines.push(hasInputs ? `✅ All inputs ≥ 16px (no iOS zoom risk)` : `✅ No form inputs on page`);
        }
        lines.push(``);

        // Spacing
        if (audit.spacing.tooClose > 0) {
          lines.push(`⚠️ TIGHT SPACING: ${audit.spacing.tooClose} pairs of interactive elements < 8px apart`);
          for (const s of audit.spacing.items) {
            lines.push(`     "${s.el1}" ↔ "${s.el2}" — ${s.gap}px gap`);
          }
        } else {
          lines.push(`✅ Interactive element spacing looks adequate`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
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

      const { browser, release } = await browserPool.acquire();
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

        // 3. Get comprehensive page data (SEO, a11y, perf — ground truth)
        const pageData = await page.evaluate(() => {
          const getMeta = (name: string) => document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute("content") || "";
          const imgs = document.querySelectorAll("img");
          const svgs = document.querySelectorAll("svg");
          const svgsExposed = Array.from(svgs).filter((svg: any) => svg.getAttribute("aria-hidden") !== "true" && !svg.getAttribute("role") && !svg.getAttribute("aria-label")).length;
          const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s: any) => { try { return JSON.parse(s.textContent); } catch { return null; } }).filter(Boolean);
          const focusable = document.querySelectorAll("a[href], button, input, textarea, select, [tabindex]:not([tabindex='-1'])");
          const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") || "";
          return {
            title: document.title,
            description: getMeta("description"),
            ogTitle: getMeta("og:title"),
            ogImage: getMeta("og:image"),
            ogType: getMeta("og:type"),
            canonical,
            h1Count: document.querySelectorAll("h1").length,
            imgCount: imgs.length,
            imgWithoutAlt: Array.from(imgs).filter((img: any) => !img.hasAttribute("alt")).length,
            svgCount: svgs.length,
            svgsExposed,
            linkCount: document.querySelectorAll("a").length,
            formCount: document.querySelectorAll("form").length,
            hasMain: !!document.querySelector("main"),
            hasHeader: !!document.querySelector("header, [role='banner']"),
            hasNav: !!document.querySelector("nav"),
            hasFooter: !!document.querySelector("footer"),
            hasSkipLink: !!document.querySelector("a[href='#main'], a[href='#content'], a[href='#main-content']"),
            focusableCount: focusable.length,
            structuredDataTypes: jsonLd.map((ld: any) => ld["@type"] || "Unknown"),
            lang: document.documentElement?.lang || "",
          };
        });

        // Get perf metrics before closing page
        const perfData = await page.evaluate(() => {
          const perf = (globalThis as any).performance;
          const nav = perf.getEntriesByType("navigation")[0] as any;
          const paint = perf.getEntriesByType("paint");
          const fcp = paint.find((e: any) => e.name === "first-contentful-paint");
          const resources = perf.getEntriesByType("resource") as any[];
          const totalTransferSize = resources.reduce((sum: number, r: any) => sum + (r.transferSize || 0), 0);
          return {
            fcp: fcp ? Math.round(fcp.startTime) : null,
            domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
            domNodes: document.querySelectorAll("*").length,
            totalTransferKB: Math.round(totalTransferSize / 1024),
            resourceCount: resources.length,
          };
        });

        await page.close();

        // 4. Build prompt and call Kimi k2.5
        const b64 = "data:image/png;base64," + Buffer.from(screenshotBuf).toString("base64");

        const client = new OpenAI({ apiKey: kimiKey, baseURL: "https://api.moonshot.ai/v1" });

        const systemPrompt = `You are a senior UX reviewer. Analyze the provided screenshot and structured page data to give a professional UX audit. Rate each category 1-10 and provide specific, actionable recommendations. Be concise but thorough. Categories: Visual Design, Accessibility, SEO, Performance Indicators, Navigation/Layout, Content Quality, Mobile-friendliness.

CRITICAL RULES:
- A "GROUND TRUTH" section is provided with verified data from the actual DOM. You MUST NOT contradict it. If the ground truth says 0 images exist, do NOT flag alt text as an issue. If structured data exists, do NOT say it is missing.
- Base your Performance score on the actual metrics provided, not speculation from the screenshot.
- Clearly distinguish between verified issues (from ground truth) and visual observations (from screenshot).`;

        const groundTruth = [
          `## GROUND TRUTH (verified from DOM — do not contradict)`,
          `Images: ${pageData.imgCount} total, ${pageData.imgWithoutAlt} missing alt${pageData.imgCount === 0 ? " (no images on page — this is NOT an alt text issue)" : ""}`,
          `SVGs: ${pageData.svgCount} total, ${pageData.svgsExposed} exposed to assistive tech without aria-hidden`,
          `Landmarks: main=${pageData.hasMain}, header=${pageData.hasHeader}, nav=${pageData.hasNav}, footer=${pageData.hasFooter}`,
          `Skip link: ${pageData.hasSkipLink}`,
          `Focusable elements: ${pageData.focusableCount}`,
          `Structured data: ${pageData.structuredDataTypes.length > 0 ? pageData.structuredDataTypes.join(", ") : "none"}`,
          `Canonical: ${pageData.canonical || "missing"}`,
          `Language: ${pageData.lang || "missing"}`,
          ``,
          `## PERFORMANCE (measured, not guessed)`,
          `FCP: ${perfData.fcp !== null ? perfData.fcp + "ms" : "N/A"}`,
          `DOM Content Loaded: ${perfData.domContentLoaded !== null ? perfData.domContentLoaded + "ms" : "N/A"}`,
          `DOM Nodes: ${perfData.domNodes}`,
          `Resources: ${perfData.resourceCount}`,
          `Transfer Size: ${perfData.totalTransferKB}KB`,
        ].join("\n");

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
              `  OG Type: ${pageData.ogType || "(none)"}`,
              `  H1 count: ${pageData.h1Count}`,
              ``,
              groundTruth,
              ``,
              `Accessibility Tree (top nodes):`,
              a11yTree,
              ``,
              `Provide your UX review with scores and specific recommendations. Base scores on the ground truth data above, not guesses.`,
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
  const NO_KEY_MSG = "Error: No AgentMail API key configured. Please add your AgentMail API key in **Dashboard → Settings** at https://www.screenshotmcp.com/dashboard/settings.\n\nAgentMail is free — sign up at https://console.agentmail.to to get your API key (starts with `am_`).";

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

  async function createPrimaryInbox(auth: SuccessfulAuth, options: { username?: string; displayName?: string }) {
    const amKey = getAgentMailKey(auth);
    if (!amKey) {
      throw new Error(NO_KEY_MSG);
    }

    const client = new AgentMailClient({ apiKey: amKey });
    const createOptions: Record<string, string> = {};

    if (options.username) {
      createOptions.username = options.username;
    }

    if (options.displayName) {
      createOptions.displayName = options.displayName;
    }

    const inbox = await client.inboxes.create(createOptions);
    const inboxId = (inbox as any).inboxId || (inbox as any).inbox_id || (inbox as any).id;
    const email = (inbox as any).email || inboxId;
    const password = generateUniquePassword();
    const id = nanoid();

    await db.insert(testInboxes).values({
      id,
      userId: auth.userId,
      email,
      password,
      displayName: options.displayName || null,
      lastUsedAt: new Date(),
    });

    return {
      inbox: {
        id,
        email,
        password,
        displayName: options.displayName || null,
      },
      inboxId,
      reused: false,
    };
  }

  async function getOrCreatePrimaryInbox(
    auth: SuccessfulAuth,
    options: { username?: string; displayName?: string; forceNew?: boolean },
  ) {
    if (!options.forceNew) {
      const existing = await getPrimaryInbox(auth.userId);
      if (existing) {
        await touchInboxUsage(existing.id);
        return {
          inbox: existing,
          inboxId: existing.email,
          reused: true,
        };
      }
    }

    return createPrimaryInbox(auth, {
      username: options.username,
      displayName: options.displayName,
    });
  }

  // @ts-ignore - TS2589: MCP SDK generic inference too deep with multiple .default() fields
  server.tool(
    "auth_test_assist",
    "Start here for website login, sign-up, and verification testing. This is the shared auth entrypoint for MCP and CLI workflows. It reuses your saved inbox/password, checks remembered auth state for the site's normalized origin, and returns reusable auth strategy plus site-specific signals such as recommended auth path, account-exists confidence, likely auth method, expected follow-up, and known-site history. Call it again with action='record' after auth attempts to save what worked.",
    {
      url: z.string().url().describe("The site URL or auth page URL to plan or record auth for."),
      action: z.enum(["plan", "record"]).default("plan").describe("Use 'plan' to get the recommended auth path. Use 'record' after an auth attempt to save the outcome."),
      intent: z.enum(["auto", "sign_in", "sign_up"]).default("auto").describe("Optional hint for the preferred auth path. Auto uses remembered site history when available."),
      loginUrl: z.string().url().optional().describe("Known login URL for the site, if you already have it."),
      outcome: z.enum(["login_success", "login_failed", "signup_success", "signup_failed", "verification_required", "verification_success"]).optional().describe("Required for action='record'. Saves what happened so future runs can reuse it."),
      verification_required: z.boolean().optional().describe("Explicitly mark whether the site usually requires email verification."),
      username: z.string().optional().describe("Optional username prefix when creating a fresh inbox."),
      display_name: z.string().optional().describe("Optional display name when creating a fresh inbox."),
      force_new_inbox: z.boolean().default(false).describe("Force creation of a brand new inbox instead of reusing the saved primary inbox."),
      notes: z.string().optional().describe("Optional short note to save alongside the auth memory."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };

      const origin = normalizeOrigin(args.url);
      const existingMemory = await getWebsiteAuthMemory(auth.userId, origin);

      if (args.action === "record") {
        if (!args.outcome) {
          return { content: [{ type: "text", text: "Error: outcome is required when action is 'record'." }] };
        }

        const inbox = await getPrimaryInbox(auth.userId);
        const stored = await upsertWebsiteAuthMemory({
          userId: auth.userId,
          origin,
          inboxId: inbox?.id ?? existingMemory?.inboxId ?? null,
          inboxEmail: inbox?.email ?? existingMemory?.inboxEmail ?? null,
          loginUrl: args.loginUrl ?? existingMemory?.loginUrl ?? null,
          preferredAuthAction: getRecommendedAuthAction(existingMemory, args.intent),
          outcome: args.outcome,
          verificationRequired: args.verification_required,
          notes: args.notes,
        });

        const knownSites = await getKnownSitesForInbox(auth.userId, inbox?.id ?? existingMemory?.inboxId ?? null);
        const recommendedAction = getRecommendedAuthAction(stored, args.intent);
        const reusableGuidance = getReusableAuthGuidance(stored, recommendedAction);
        const siteHints = getSiteSpecificHints(stored);

        return {
          content: [{
            type: "text",
            text: `## Auth Memory Updated\n\n- **Origin:** ${origin}\n- **Outcome saved:** ${args.outcome}\n- **Current summary:** ${describeWebsiteAuthMemory(stored)}\n- **Recommended future auth path:** ${recommendedAction}\n- **Account exists confidence:** ${getAccountExistsConfidence(stored)}\n- **Known auth method:** ${getKnownAuthMethod(stored)}\n- **Expected follow-up:** ${getExpectedFollowup(stored)}\n- **Known sites for this inbox:** ${formatKnownSites(knownSites, origin)}\n\nReusable strategy for future runs:\n${reusableGuidance.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\nSite-specific hints:\n${siteHints.length > 0 ? siteHints.map((item) => `- ${item}`).join("\n") : "- No site-specific hints recorded yet."}\n\nFuture runs can now reuse this auth memory with **auth_test_assist**.`,
          }],
        };
      }

      let primaryInbox;
      try {
        primaryInbox = await getOrCreatePrimaryInbox(auth, {
          username: args.username,
          displayName: args.display_name,
          forceNew: args.force_new_inbox,
        });
      } catch (errorValue) {
        const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
        return { content: [{ type: "text", text: message.startsWith("Error:") ? message : `Error: ${message}` }] };
      }

      const recommendedAction = getRecommendedAuthAction(existingMemory, args.intent);
      const plannedMemory = await upsertWebsiteAuthMemory({
        userId: auth.userId,
        origin,
        inboxId: primaryInbox.inbox.id,
        inboxEmail: primaryInbox.inbox.email,
        loginUrl: args.loginUrl ?? existingMemory?.loginUrl ?? null,
        preferredAuthAction: recommendedAction,
        verificationRequired: args.verification_required ?? existingMemory?.verificationRequired ?? false,
        notes: args.notes,
      });
      const knownSites = await getKnownSitesForInbox(auth.userId, primaryInbox.inbox.id);
      const authEvidence = getAuthEvidence(plannedMemory);
      const siteHints = getSiteSpecificHints(plannedMemory);
      const reusableGuidance = getReusableAuthGuidance(plannedMemory, recommendedAction);
      const loginPage = args.loginUrl || existingMemory?.loginUrl || "the site's login page";

      const nextSteps = recommendedAction === "sign_in"
        ? [
            `1. Open ${loginPage} and try **sign in** with the saved primary email and password.`,
            "2. If the site routes into verification, magic-link, or OTP flow, continue that path with **check_inbox** instead of treating it as a failure.",
            "3. If the page is multi-step or the visible submit control is flaky, use browser fallbacks such as **browser_fill**, **browser_press_key**, or **browser_evaluate**.",
            "4. After the attempt, call **auth_test_assist** with action: \"record\" and the outcome.",
          ]
        : recommendedAction === "sign_up"
          ? [
              "1. Start with the site's sign-up flow using the saved inbox and password below.",
              "2. If the site sends a verification email, OTP, or magic link, complete that verification path with **check_inbox** before judging the attempt.",
              "3. If the sign-up UI is brittle or multi-step, use browser fallbacks and inspect console or network evidence before concluding it failed.",
              "4. After the attempt, call **auth_test_assist** with action: \"record\" and the outcome.",
            ]
          : [
              `1. Start at ${loginPage} if you know it, otherwise find the canonical login page first.`,
              "2. Prefer **sign in** first, then switch to sign-up only if the site clearly says the account does not exist.",
              "3. Treat verification, OTP, and magic-link steps as normal auth completion paths and use **check_inbox** when needed.",
              "4. If the UI appears stuck but the form is valid, use browser fallbacks and inspect console or network evidence before declaring failure.",
              "5. After the attempt, call **auth_test_assist** with action: \"record\" and the outcome.",
            ];

      return {
        content: [{
          type: "text",
          text: `## Auth Test Assist\n\nReusable strategy:\n${reusableGuidance.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\nCurrent site signals:\n- **Origin:** ${origin}\n- **Remembered auth state:** ${describeWebsiteAuthMemory(plannedMemory)}\n- **Recommended auth path:** ${recommendedAction}\n- **Account exists confidence:** ${getAccountExistsConfidence(plannedMemory)}\n- **Known auth method:** ${getKnownAuthMethod(plannedMemory)}\n- **Expected follow-up:** ${getExpectedFollowup(plannedMemory)}\n- **Known sites for this inbox:** ${formatKnownSites(knownSites, origin)}\n\nSite-specific evidence:\n${authEvidence.length > 0 ? authEvidence.map((item) => `- ${item}`).join("\n") : "- No prior site-specific evidence yet."}\n${siteHints.length > 0 ? `\nSite-specific hints:\n${siteHints.map((item) => `- ${item}`).join("\n")}` : ""}\n\nCredentials:\n- **Email:** ${primaryInbox.inbox.email}\n- **Password:** ${primaryInbox.inbox.password}\n- **Inbox ID:** ${primaryInbox.inboxId}\n- **Inbox status:** ${primaryInbox.reused ? "reused saved primary inbox" : "created new primary inbox"}\n\nSuggested next actions:\n${nextSteps.join("\n")}`,
        }],
      };
    }
  );

  // @ts-ignore - TS2589: MCP SDK generic inference too deep with multiple .default() fields
  server.tool(
    "local_browser_escalate_hint",
    "When MCP browser automation silently stalls on a cloud-browser-hostile site (WorkOS AuthKit, Cloudflare Turnstile, Clerk bot-detection, Akamai/PerimeterX), call this tool to get the exact CLI commands the agent should run to escalate to the user's local Chrome. Returns a ready-to-run command sequence plus the saved credentials for the site's origin from websiteAuthMemories/testInboxes. Does NOT take any browser action — purely informational.",
    {
      site: z.string().url().describe("The site URL that MCP stalled on (e.g. https://smithery.ai)."),
      lastObservedIssue: z.string().optional().describe("Short free-text note describing what the cloud browser saw (e.g. 'solve_captcha returned success but form did not advance'). Optional."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };

      const origin = normalizeOrigin(args.site);
      const [memory, primaryInbox] = await Promise.all([
        getWebsiteAuthMemory(auth.userId, origin),
        getPrimaryInbox(auth.userId),
      ]);

      const savedEmail = memory?.inboxEmail ?? primaryInbox?.email ?? "<run `auth:plan` first>";
      const savedPassword = primaryInbox?.password ?? "<run `auth:plan` first>";
      const siteNote = memory?.notes ? `\n\n**Saved notes for ${origin}:**\n${memory.notes}` : "";
      const priorPath = memory?.lastSuccessfulAuthPath
        ? `\n**Last successful auth path:** ${memory.lastSuccessfulAuthPath}`
        : "";

      const commands = [
        `npx screenshotsmcp auth:plan ${args.site}`,
        `npx screenshotsmcp browser:start ${args.site}`,
        `npx screenshotsmcp browser:inspect   # dump the visible form fields and selectors`,
        `npx screenshotsmcp browser:click "<selector-or-text>"`,
        `npx screenshotsmcp browser:fill "input[name=email]" "${savedEmail}"`,
        `npx screenshotsmcp browser:fill "input[name=password]" "${savedPassword}"`,
        `npx screenshotsmcp browser:click "button[type=submit]"`,
        `npx screenshotsmcp browser:wait 3000   # or browser:wait-for <selector>`,
        `# → if an OTP screen appears:`,
        `npx screenshotsmcp inbox:check ${savedEmail}   # grab the code`,
        `npx screenshotsmcp browser:paste "input.rt-TextFieldInput" "<6-digit-code>"`,
        `npx screenshotsmcp browser:eval "document.querySelector('form').requestSubmit(); 'ok'"`,
        `npx screenshotsmcp auth:record ${args.site} signup_success --notes "..."`,
        `npx screenshotsmcp browser:stop`,
      ];

      const rationale = [
        "Cloud-browser-hostile sites (WorkOS AuthKit / Cloudflare Turnstile / Clerk bot-detection) filter out requests from the Railway-hosted Chromium fingerprint even when `solve_captcha` returns a valid token. Retrying in MCP is futile.",
        "Real Chrome on the user's residential IP passes those trust checks silently — often without showing a CAPTCHA at all (the Smithery signup went the full name → email → password → OTP path without any checkbox appearing).",
        "The interactive rule: after every `browser:*` command, read the returned PNG, confirm the state matches expectations, then issue the next command. Never chain commands blindly.",
      ];

      return {
        content: [{
          type: "text",
          text: [
            `## Escalate to CLI local browser`,
            ``,
            `**Site:** ${args.site}`,
            args.lastObservedIssue ? `**Observed issue:** ${args.lastObservedIssue}` : "",
            priorPath,
            siteNote,
            ``,
            `### Why escalate`,
            ``,
            rationale.map((line) => `- ${line}`).join("\n"),
            ``,
            `### Command sequence`,
            ``,
            "```bash",
            commands.join("\n"),
            "```",
            ``,
            `### Saved credentials from the DB`,
            ``,
            `- **Email:** ${savedEmail}`,
            `- **Password:** ${savedPassword}`,
            `- **Known auth state for ${origin}:** ${memory ? describeWebsiteAuthMemory(memory) : "no prior attempts recorded"}`,
            ``,
            `Call \`auth:plan ${args.site}\` first to refresh this state, and \`auth:record ${args.site} <outcome>\` after the attempt so future runs resume correctly.`,
          ].filter(Boolean).join("\n"),
        }],
      };
    }
  );

  // @ts-ignore - TS2589 guard
  server.tool(
    "write_run_outcome",
    "Write the developer-facing 'problem → outcome' story for a browser run so the dashboard Summary tab can render it above the narrated timeline. Call this at the end of any non-trivial flow (signup, audit, login, automation). Takes a short `problem` (what you were trying to do), a `summary` (what actually happened), a `verdict`, and optional `nextActions`. Updates the run_outcomes row for this runId.",
    {
      runId: z.string().describe("The run id (from browser_navigate / CLI browser:start / dashboard)."),
      problem: z.string().describe("One-paragraph statement of the problem or task you attempted (e.g. 'Publish ScreenshotsMCP to Smithery MCP registry via WorkOS AuthKit signup')."),
      summary: z.string().describe("One-paragraph summary of what actually happened and whether it worked. Include URLs, credentials persisted, blockers hit."),
      verdict: z.enum(["passed", "failed", "inconclusive", "flaky"]).optional().describe("Overall verdict for this run. Defaults to 'inconclusive' if omitted."),
      nextActions: z.array(z.string()).optional().describe("Optional follow-up steps for a future session."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };

      // Verify the run belongs to this user.
      const [run] = await db
        .select({ id: runs.id })
        .from(runs)
        .where(and(eq(runs.id, args.runId), eq(runs.userId, auth.userId)));
      if (!run) return { content: [{ type: "text", text: `Error: run ${args.runId} not found for this account.` }] };

      const [existing] = await db
        .select({ id: runOutcomes.id })
        .from(runOutcomes)
        .where(eq(runOutcomes.runId, args.runId));

      const patch = {
        problem: args.problem,
        summary: args.summary,
        verdict: args.verdict ?? "inconclusive",
        ...(args.nextActions ? { nextActions: JSON.stringify(args.nextActions) } : {}),
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(runOutcomes).set(patch).where(eq(runOutcomes.id, existing.id));
      } else {
        await db.insert(runOutcomes).values({
          id: nanoid(),
          runId: args.runId,
          userId: auth.userId,
          ...patch,
        });
      }

      return {
        content: [{
          type: "text",
          text: `Run outcome saved for ${args.runId}. View at https://web-phi-eight-56.vercel.app/dashboard/runs/${args.runId}`,
        }],
      };
    }
  );

  // @ts-ignore
  server.tool(
    "create_test_inbox",
    "Standalone inbox helper for testing. Create or reuse the saved primary disposable email inbox, then use auth_test_assist first when the task is website auth so you also get reusable cross-site strategy and remembered per-site guidance. Returns email, password, inbox ID, and known-site history for the reusable inbox.",
    {
      username: z.string().optional().describe("Optional username prefix for the email (e.g. 'test-user' → test-user@agentmail.to). Auto-generated if omitted."),
      display_name: z.string().optional().describe("Optional display name for the inbox (e.g. 'Test User')"),
      force_new: z.boolean().optional().default(false).describe("Force creation of a new inbox even if existing ones are available. Use when testing registration flows."),
    },
    async ({ username, display_name, force_new }) => {
      try {
        const auth = await validateKey(apiKey);
        if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };
        const primaryInbox = await getOrCreatePrimaryInbox(auth, {
          username,
          displayName: display_name,
          forceNew: force_new,
        });
        const knownSites = await getKnownSitesForInbox(auth.userId, primaryInbox.inbox.id);

        if (primaryInbox.reused) {
          return {
            content: [{
              type: "text",
              text: `## Reusing Saved Primary Inbox\n\n- **Email:** ${primaryInbox.inbox.email}\n- **Password:** ${primaryInbox.inbox.password}\n- **Inbox ID:** ${primaryInbox.inboxId}\n- **Known sites for this inbox:** ${formatKnownSites(knownSites)}\n\nThis is your saved primary inbox for website testing. Reuse this same email and password for sign-in or sign-up flows whenever possible.\nUse **check_inbox** to read any emails that arrive.\n\nFor site-specific sign-in vs sign-up guidance, account-exists confidence, likely auth method, and expected follow-up, call **auth_test_assist** with the website URL first.\n\nTo create a fresh inbox instead, call create_test_inbox with force_new: true.`,
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: `## Primary Test Inbox Created\n\n- **Email:** ${primaryInbox.inbox.email}\n- **Password:** \`${primaryInbox.inbox.password}\`\n- **Inbox ID:** ${primaryInbox.inboxId}\n- **Known sites for this inbox:** ${formatKnownSites(knownSites)}\n\nUse this email and password as your reusable website testing identity. Then use **check_inbox** to read any verification emails that arrive.\n\n**Important:** Always use the password above — it is unique and won't trigger breach detection.\nFor site-specific sign-in vs sign-up guidance, call **auth_test_assist** with the website URL first.\nThis inbox is saved to your dashboard (Settings → Test Inboxes) for reuse across future runs.`,
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
    "Automatically solve CAPTCHAs on the current page using CapSolver AI. Supports Cloudflare Turnstile, reCAPTCHA v2/v3, and hCaptcha. Detects the CAPTCHA type and sitekey automatically, sends it to CapSolver for solving, injects the token, and optionally submits the form. Use this when a CAPTCHA blocks form submission during browser automation. IMPORTANT: if this returns success:true but the form silently fails to submit (URL doesn't change, no error, form resets) — common on WorkOS AuthKit + Cloudflare Turnstile (e.g. Smithery) — the token was rejected by Siteverify because the Railway-hosted Chromium fingerprint doesn't match a real user. Do NOT retry. Escalate to the CLI local browser: `npx screenshotsmcp browser:start <url>` and drive real Chrome interactively. Real Chrome on the user's residential IP passes Turnstile trust checks silently, often without even showing a checkbox.",
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
                // Turnstile sitekeys are `0x` + ~22 base62 chars
                // (e.g. `0x4AAAAAAAMNIvC45A4Wjjln`). The regex used to
                // only match pure hex, which silently truncated real keys.
                const match = s.textContent?.match(/sitekey['":\s]+['"]?(0x[A-Za-z0-9_-]{18,})/);
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
          // Two known encodings for the sitekey in Turnstile network traffic:
          //   1. Query string: `...?sitekey=0x...` (classic `<div data-sitekey>`)
          //   2. Path slot:    `.../turnstile/f/ov2/av0/rch/{slot}/0x.../...`
          //      (WorkOS AuthKit + any explicit-render integration)
          // Also scan the parent doc's resource entries via evaluate in case
          // the request went to the iframe and was not captured by our
          // request listener on the top frame.
          const allUrls = [
            ...session.networkRequests.map(r => r.url),
            ...(await page.evaluate(() => {
              try {
                return performance.getEntriesByType('resource').map((e) => (e as PerformanceResourceTiming).name);
              } catch { return []; }
            })) as string[],
          ];
          const SITE_KEY_RE = /\b0x[A-Za-z0-9_-]{18,}/;
          for (const u of allUrls) {
            if (!u.includes('turnstile')) continue;
            // Query-string style
            const qMatch = u.match(/[?&]sitekey=([^&]+)/);
            if (qMatch) { finalSitekey = qMatch[1]; break; }
            // Path-slot style (WorkOS and explicit-render)
            const pMatch = u.match(SITE_KEY_RE);
            if (pMatch) { finalSitekey = pMatch[0]; break; }
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

        // Step 3: Inject token into the page.
        //
        // For Turnstile we cannot just drop the token into a hidden
        // <input name="cf-turnstile-response"> — WorkOS AuthKit and several
        // other integrations render the widget with `render=explicit` and
        // never create that input until the real widget success callback
        // fires. We need to:
        //   (a) Ensure the hidden input exists inside every candidate form.
        //   (b) Overwrite `turnstile.getResponse()` so any code that reads
        //       the token gets ours.
        //   (c) Invoke the widget's registered `callback` (the function the
        //       host app passed to `turnstile.render(config)`) with the
        //       solved token. This is the single step that mutates the app's
        //       internal auth state on every AuthKit / Clerk / generic
        //       Turnstile integration.
        //   (d) Fire standard DOM events so form-level validators see the
        //       value change.
        const injected = await page.evaluate((data) => {
          const { type, token } = data;
          if (type === 'turnstile') {
            // (a) Ensure hidden input exists in every form we can see.
            const forms = document.querySelectorAll('form');
            const ensureInputIn = (parent: Element) => {
              let input = parent.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
              if (!input) {
                input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'cf-turnstile-response';
                parent.appendChild(input);
              }
              input.value = token;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return input;
            };
            let injectedAny = false;
            forms.forEach((f) => { ensureInputIn(f); injectedAny = true; });
            // If no form, still drop one into <body> so any polling code finds it.
            if (!injectedAny) ensureInputIn(document.body);

            // (b) Make `turnstile.getResponse()` return our token for any
            // code that asks. Guard with try/catch because the API may not
            // yet be initialised.
            try {
              const ts = (window as any).turnstile;
              if (ts) {
                (window as any).turnstile.getResponse = (_id?: string) => token;
              }
            } catch {}

            // (c) Invoke every registered widget callback. Turnstile stores
            // configs in an internal registry that varies by version; we
            // probe a few well-known shapes.
            let callbackFired = false;
            try {
              const ts: any = (window as any).turnstile;
              // Modern Turnstile exposes _w / _widgets / _config maps.
              const registries = [ts?._widgets, ts?._w, ts?._config, ts?._renderCallbacks].filter(Boolean);
              for (const reg of registries) {
                if (!reg) continue;
                const values = reg instanceof Map ? [...reg.values()] : Object.values(reg);
                for (const cfg of values as any[]) {
                  const cb = cfg?.callback || cfg?.params?.callback || cfg?.options?.callback;
                  if (typeof cb === "function") { try { cb(token); callbackFired = true; } catch {} }
                }
              }
              // Clerk registers success handlers on `window.__clerk_captcha_callbacks`
              const clerkCbs = (window as any).__clerk_captcha_callbacks;
              if (Array.isArray(clerkCbs)) {
                for (const cb of clerkCbs) { try { cb(token); callbackFired = true; } catch {} }
              }
              // WorkOS / WorkOS AuthKit sometimes uses a global onload handler
              const workosCb = (window as any).onloadTurnstileCallback || (window as any).cfCallback;
              if (typeof workosCb === "function") { try { workosCb(token); callbackFired = true; } catch {} }
            } catch {}

            return callbackFired || injectedAny;
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

  // ── OG Image Preview ────────────────────────────────────────
  // @ts-ignore - TS2589: MCP SDK generic inference too deep with multiple .default() fields
  server.tool(
    "og_preview",
    "Preview how a URL will look when shared on social media. Extracts all Open Graph and Twitter Card meta tags from the rendered page, validates them, screenshots the og:image, and generates a social card mockup. Works with JS-rendered pages (SPAs). No browser session needed.",
    {
      url: z.string().url().describe("URL to preview Open Graph tags for"),
      platform: z.enum(["twitter", "facebook", "linkedin", "slack", "all"]).default("all").describe("Social platform to generate mockup for (default: all)"),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };

      const { browser, release } = await browserPool.acquire();
      let context;
      try {
        context = await browser.newContext({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          viewport: { width: 1200, height: 630 },
          locale: "en-US",
        });
        const page = await context.newPage();
        try {
          await page.goto(args.url, { waitUntil: "networkidle", timeout: 30000 });
        } catch {
          await page.goto(args.url, { waitUntil: "load", timeout: 30000 });
        }
        await page.waitForTimeout(1500);

        // Extract OG/Twitter/meta tags from rendered DOM
        const meta = await page.evaluate(() => {
          const doc = (globalThis as any).document;
          const getMeta = (name: string) =>
            doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content") || null;

          const og = {
            title: getMeta("og:title"),
            description: getMeta("og:description"),
            image: getMeta("og:image"),
            imageWidth: getMeta("og:image:width"),
            imageHeight: getMeta("og:image:height"),
            imageAlt: getMeta("og:image:alt"),
            type: getMeta("og:type"),
            url: getMeta("og:url"),
            siteName: getMeta("og:site_name"),
            locale: getMeta("og:locale"),
          };

          const twitter = {
            card: getMeta("twitter:card"),
            title: getMeta("twitter:title"),
            description: getMeta("twitter:description"),
            image: getMeta("twitter:image"),
            imageAlt: getMeta("twitter:image:alt"),
            site: getMeta("twitter:site"),
            creator: getMeta("twitter:creator"),
          };

          return {
            pageUrl: (globalThis as any).location.href,
            pageTitle: doc.title || null,
            metaDescription: getMeta("description"),
            canonical: doc.querySelector('link[rel="canonical"]')?.href || null,
            og,
            twitter,
            favicon: doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]')?.href || null,
          };
        });

        // Validate OG tags
        const issues: string[] = [];
        const warnings: string[] = [];
        const passes: string[] = [];

        // OG validation
        if (!meta.og.title) issues.push("❌ og:title is missing");
        else if (meta.og.title.length > 60) warnings.push(`⚠️ og:title is ${meta.og.title.length} chars (recommended ≤60)`);
        else passes.push(`✅ og:title (${meta.og.title.length} chars)`);

        if (!meta.og.description) issues.push("❌ og:description is missing");
        else if (meta.og.description.length > 200) warnings.push(`⚠️ og:description is ${meta.og.description.length} chars (recommended ≤200)`);
        else passes.push(`✅ og:description (${meta.og.description.length} chars)`);

        if (!meta.og.image) issues.push("❌ og:image is missing — social shares will have no preview image");
        else passes.push(`✅ og:image is set`);

        if (!meta.og.url) warnings.push("⚠️ og:url is missing");
        else passes.push(`✅ og:url is set`);

        if (!meta.og.type) warnings.push("⚠️ og:type is missing (defaults to 'website')");
        else passes.push(`✅ og:type: ${meta.og.type}`);

        if (!meta.og.siteName) warnings.push("⚠️ og:site_name is missing");
        else passes.push(`✅ og:site_name: ${meta.og.siteName}`);

        // Twitter validation
        if (!meta.twitter.card) warnings.push("⚠️ twitter:card is missing (falls back to OG tags)");
        else passes.push(`✅ twitter:card: ${meta.twitter.card}`);

        if (!meta.twitter.title && !meta.og.title) issues.push("❌ No twitter:title and no og:title fallback");
        if (!meta.twitter.image && !meta.og.image) issues.push("❌ No twitter:image and no og:image fallback");

        // Image validation
        if (meta.og.image && !meta.og.imageAlt && !meta.twitter.imageAlt) {
          warnings.push("⚠️ og:image:alt is missing — hurts accessibility and some platforms");
        }

        if (!meta.canonical) warnings.push("⚠️ canonical URL is missing");
        else {
          const pageUrlNorm = meta.pageUrl.replace(/\/$/, "");
          const canonicalNorm = meta.canonical.replace(/\/$/, "");
          if (canonicalNorm !== pageUrlNorm) {
            issues.push(`❌ CANONICAL MISMATCH: canonical (${meta.canonical}) does not match page URL (${meta.pageUrl}) — Google may treat this page as a duplicate`);
          } else {
            passes.push(`✅ canonical: ${meta.canonical}`);
          }
        }

        // og:url mismatch detection
        if (meta.og.url) {
          const pageUrlNorm = meta.pageUrl.replace(/\/$/, "");
          const ogUrlNorm = meta.og.url.replace(/\/$/, "");
          if (ogUrlNorm !== pageUrlNorm) {
            issues.push(`❌ og:url MISMATCH: og:url (${meta.og.url}) does not match page URL (${meta.pageUrl}) — social shares will link to the wrong page`);
          }
        }

        // Screenshot the og:image if it exists
        let ogImageScreenshot: { type: "image"; data: string; mimeType: string } | null = null;
        let ogImageDimensions = "";
        if (meta.og.image) {
          try {
            const imgPage = await context.newPage();
            // Resolve relative URLs
            let imgUrl = meta.og.image;
            if (imgUrl.startsWith("/")) {
              const parsed = new URL(args.url);
              imgUrl = `${parsed.origin}${imgUrl}`;
            }
            await imgPage.goto(imgUrl, { waitUntil: "load", timeout: 15000 });
            await imgPage.waitForTimeout(500);

            // Get the actual image dimensions
            const dims = await imgPage.evaluate(() => {
              const img = (globalThis as any).document.querySelector("img");
              if (img) return { w: img.naturalWidth, h: img.naturalHeight };
              return { w: (globalThis as any).innerWidth, h: (globalThis as any).innerHeight };
            });
            ogImageDimensions = `${dims.w}×${dims.h}`;

            // Validate recommended dimensions
            if (dims.w < 1200 || dims.h < 630) {
              warnings.push(`⚠️ og:image is ${dims.w}×${dims.h} — recommended minimum is 1200×630`);
            } else {
              passes.push(`✅ og:image dimensions: ${dims.w}×${dims.h}`);
            }

            const buf = await imgPage.screenshot({ type: "jpeg", quality: 80 });
            ogImageScreenshot = {
              type: "image",
              data: Buffer.from(buf).toString("base64"),
              mimeType: "image/jpeg",
            };
            await imgPage.close();
          } catch {
            warnings.push("⚠️ Could not load og:image URL for preview");
          }
        }

        // Build social card mockup via Playwright
        const title = meta.og.title || meta.twitter.title || meta.pageTitle || "No title";
        const desc = meta.og.description || meta.twitter.description || meta.metaDescription || "";
        const siteName = meta.og.siteName || new URL(args.url).hostname;
        const ogImgUrl = meta.og.image || meta.twitter.image || "";

        // Generate a social card mockup
        const mockupPage = await context.newPage();
        await mockupPage.setViewportSize({ width: 600, height: 340 });
        await mockupPage.setContent(`
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; padding: 20px; }
              .card { background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #ddd; max-width: 560px; }
              .card-img { width: 100%; height: 200px; background: #e4e6eb url('${ogImgUrl}') center/cover no-repeat; display: flex; align-items: center; justify-content: center; color: #65676b; font-size: 14px; }
              .card-body { padding: 12px 16px; }
              .card-site { font-size: 12px; color: #65676b; text-transform: uppercase; margin-bottom: 4px; }
              .card-title { font-size: 16px; font-weight: 600; color: #1c1e21; line-height: 1.3; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
              .card-desc { font-size: 14px; color: #65676b; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
              .label { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
            </style>
          </head>
          <body>
            <div style="position:relative">
              <div class="label">Social Card Preview</div>
              <div class="card">
                <div class="card-img">${ogImgUrl ? "" : "No og:image set"}</div>
                <div class="card-body">
                  <div class="card-site">${siteName}</div>
                  <div class="card-title">${title.replace(/"/g, "&quot;").replace(/</g, "&lt;")}</div>
                  <div class="card-desc">${desc.replace(/"/g, "&quot;").replace(/</g, "&lt;").slice(0, 150)}</div>
                </div>
              </div>
            </div>
          </body>
          </html>
        `, { waitUntil: "networkidle" });
        await mockupPage.waitForTimeout(500);
        const mockupBuf = await mockupPage.screenshot({ type: "jpeg", quality: 85 });
        const mockupImage = {
          type: "image" as const,
          data: Buffer.from(mockupBuf).toString("base64"),
          mimeType: "image/jpeg",
        };
        await mockupPage.close();

        // Build report
        const score = Math.round(
          (passes.length / (passes.length + issues.length + warnings.length)) * 100
        );
        const lines = [
          `# OG Preview: ${args.url}`,
          ``,
          `**Score: ${score}/100** (${passes.length} passed, ${warnings.length} warnings, ${issues.length} critical)`,
          ``,
          `## Open Graph Tags`,
          `| Tag | Value |`,
          `|-----|-------|`,
          ...Object.entries(meta.og).map(([k, v]) => `| og:${k} | ${v ? String(v).slice(0, 80) : "—"} |`),
          ``,
          `## Twitter Card Tags`,
          `| Tag | Value |`,
          `|-----|-------|`,
          ...Object.entries(meta.twitter).map(([k, v]) => `| twitter:${k} | ${v ? String(v).slice(0, 80) : "—"} |`),
          ``,
          `## Validation`,
          ...issues,
          ...warnings,
          ...passes,
          ``,
          ...(meta.og.image ? [
            `## og:image`,
            `URL: ${meta.og.image}`,
            ...(ogImageDimensions ? [`Dimensions: ${ogImageDimensions}`] : []),
          ] : []),
          ``,
          `## Recommendations`,
          ...(issues.length > 0 ? [`- Fix ${issues.length} critical issue(s) above`] : []),
          ...(!meta.og.image ? ["- Add an og:image (recommended 1200×630px) for rich social sharing"] : []),
          ...(!meta.og.imageAlt ? ["- Add og:image:alt for accessibility"] : []),
          ...(!meta.twitter.card ? ["- Add twitter:card for Twitter-specific display control"] : []),
          ...(!meta.twitter.site ? ["- Add twitter:site (@handle) for Twitter attribution"] : []),
          ...(issues.length === 0 && warnings.length === 0 ? ["🎉 All OG tags look great! Your social cards will display correctly."] : []),
        ];

        const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
          { type: "text", text: lines.join("\n") },
          mockupImage,
        ];

        if (ogImageScreenshot) {
          content.push(ogImageScreenshot);
        }

        return { content };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${humanizeError(err instanceof Error ? err.message : String(err))}` }] };
      } finally {
        if (context) await context.close().catch(() => {});
        await release();
      }
    }
  );

  server.tool(
    "seo_batch_compare",
    "Compare SEO metadata across 2–10 URLs in one call. Returns a comparison table showing which meta fields are duplicated across pages — catches identical titles, descriptions, OG tags, and canonical issues that single-page tools miss. No browser session needed.",
    {
      urls: z.array(z.string().url()).min(2).max(10).describe("Array of 2–10 URLs to compare SEO metadata across"),
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

        const results: Array<{
          url: string; title: string | null; description: string | null;
          canonical: string | null; ogTitle: string | null; ogDescription: string | null;
          ogImage: string | null; ogUrl: string | null; twitterCard: string | null;
          jsonLdTypes: string[];
        }> = [];

        for (const url of args.urls) {
          const page = await context.newPage();
          try {
            try { await page.goto(url, { waitUntil: "networkidle", timeout: 20000 }); }
            catch { await page.goto(url, { waitUntil: "load", timeout: 20000 }); }
            await page.waitForTimeout(1000);

            const meta = await page.evaluate(() => {
              const doc = (globalThis as any).document;
              const getMeta = (name: string) => doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content") || null;
              const jsonLd = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map((s: any) => {
                try { return JSON.parse(s.textContent); } catch { return null; }
              }).filter(Boolean);
              return {
                url: (globalThis as any).location.href,
                title: doc.title || null,
                description: getMeta("description"),
                canonical: doc.querySelector('link[rel="canonical"]')?.href || null,
                ogTitle: getMeta("og:title"),
                ogDescription: getMeta("og:description"),
                ogImage: getMeta("og:image"),
                ogUrl: getMeta("og:url"),
                twitterCard: getMeta("twitter:card"),
                jsonLdTypes: jsonLd.map((ld: any) => ld["@type"] || "Unknown"),
              };
            });
            results.push(meta);
          } catch (err) {
            results.push({
              url, title: `ERROR: ${err instanceof Error ? err.message : String(err)}`,
              description: null, canonical: null, ogTitle: null, ogDescription: null,
              ogImage: null, ogUrl: null, twitterCard: null, jsonLdTypes: [],
            });
          } finally {
            await page.close();
          }
        }

        // Build comparison table
        const fields = ["title", "description", "canonical", "ogTitle", "ogDescription", "ogImage", "ogUrl", "twitterCard"] as const;
        const fieldLabels: Record<string, string> = {
          title: "Title", description: "Meta Description", canonical: "Canonical",
          ogTitle: "og:title", ogDescription: "og:description", ogImage: "og:image",
          ogUrl: "og:url", twitterCard: "twitter:card",
        };

        // Detect duplicates
        const duplicateWarnings: string[] = [];
        for (const field of fields) {
          const values = results.map(r => r[field]).filter(Boolean);
          const unique = new Set(values);
          if (values.length > 1 && unique.size === 1) {
            duplicateWarnings.push(`❌ ALL PAGES SHARE IDENTICAL ${fieldLabels[field]}: "${String(values[0]).slice(0, 80)}"`);
          } else if (values.length > 1 && unique.size < values.length) {
            const counts = new Map<string, string[]>();
            results.forEach(r => {
              const v = r[field];
              if (v) {
                if (!counts.has(v)) counts.set(v, []);
                counts.get(v)!.push(r.url);
              }
            });
            for (const [val, urls] of counts) {
              if (urls.length > 1) {
                duplicateWarnings.push(`⚠️ DUPLICATE ${fieldLabels[field]}: "${String(val).slice(0, 60)}" shared by ${urls.length} pages`);
              }
            }
          }
        }

        // Canonical mismatch per-page
        for (const r of results) {
          if (r.canonical) {
            const canonNorm = r.canonical.replace(/\/$/, "");
            const urlNorm = r.url.replace(/\/$/, "");
            if (canonNorm !== urlNorm) {
              duplicateWarnings.push(`❌ CANONICAL MISMATCH on ${r.url}: canonical points to ${r.canonical}`);
            }
          }
          if (r.ogUrl) {
            const ogNorm = r.ogUrl.replace(/\/$/, "");
            const urlNorm = r.url.replace(/\/$/, "");
            if (ogNorm !== urlNorm) {
              duplicateWarnings.push(`❌ og:url MISMATCH on ${r.url}: og:url points to ${r.ogUrl}`);
            }
          }
        }

        // Build output
        const lines = [
          `# SEO Batch Compare — ${results.length} pages`,
          ``,
          ...(duplicateWarnings.length > 0 ? [`## ⚠️ Issues Found`, ...duplicateWarnings, ``] : [`## ✅ No duplicates or mismatches detected`, ``]),
          `## Per-Page Summary`,
          `| URL | Title | Description | Canonical | og:title | og:image | Structured Data |`,
          `|-----|-------|-------------|-----------|----------|----------|-----------------|`,
          ...results.map(r => {
            const shortUrl = r.url.replace(/https?:\/\/(www\.)?/, "").slice(0, 30);
            const canonOk = r.canonical ? (r.canonical.replace(/\/$/, "") === r.url.replace(/\/$/, "") ? "✅" : "❌ mismatch") : "—";
            return `| ${shortUrl} | ${(r.title || "—").slice(0, 35)} | ${(r.description || "—").slice(0, 30)} | ${canonOk} | ${(r.ogTitle || "—").slice(0, 30)} | ${r.ogImage ? "✅" : "❌"} | ${r.jsonLdTypes.length > 0 ? r.jsonLdTypes.join(", ") : "None"} |`;
          }),
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${humanizeError(err instanceof Error ? err.message : String(err))}` }] };
      } finally {
        if (context) await context.close().catch(() => {});
        await release();
      }
    }
  );

  server.tool(
    "extract_text_from_image",
    "Extract text from an image using AI vision (OCR). Works on screenshots, photos of text, infographics, social cards, Canva graphics, and any image with embedded text. Pass an image URL or use within a browser session to extract text from the current page screenshot or a specific element.",
    {
      image_url: z.string().optional().describe("Public URL of the image to extract text from. If omitted, sessionId is required and a screenshot of the current page (or element) will be used."),
      sessionId: z.string().optional().describe("Browser session ID. If provided (without image_url), a screenshot of the current page is used for OCR."),
      selector: z.string().optional().describe("CSS selector of a specific element to screenshot for OCR (only used with sessionId)."),
      prompt: z.string().optional().default("Read this image carefully. List every piece of text you can see — headings, body text, labels, buttons, links, watermarks, captions, and any other words. Return the text exactly as it appears, preserving line breaks and structure. If the image contains no text at all, say 'No text found.'").describe("Custom prompt for the vision model. Override to ask specific questions about the image content."),
    },
    async (args) => {
      const auth = await validateKey(apiKey);
      if (!auth.ok) return { content: [{ type: "text", text: `Error: ${auth.error}` }] };

      const kimiKey = process.env.KIMI_API_KEY;
      if (!kimiKey) return { content: [{ type: "text", text: "Error: Vision API key not configured on the server. Contact the administrator." }] };

      let imageDataUrl: string;

      if (args.image_url) {
        // Fetch the image and convert to base64 data URL
        try {
          const imgRes = await fetch(args.image_url, { signal: AbortSignal.timeout(15000) });
          if (!imgRes.ok) return { content: [{ type: "text", text: `Error: Failed to fetch image (${imgRes.status}). Make sure the URL is publicly accessible.` }] };
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const ct = imgRes.headers.get("content-type") || "image/png";
          const mimeType = ct.split(";")[0].trim();
          imageDataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
        } catch (err) {
          return { content: [{ type: "text", text: `Error fetching image: ${err instanceof Error ? err.message : String(err)}` }] };
        }
      } else if (args.sessionId) {
        // Take a screenshot from the browser session
        const session = await getSession(args.sessionId, auth.userId);
        if (!session) return { content: [{ type: "text", text: "Error: Session not found or expired." }] };
        try {
          let screenshotBuf: Buffer;
          if (args.selector) {
            const loc = session.page.locator(args.selector).first();
            const count = await loc.count().catch(() => 0);
            if (count === 0) return { content: [{ type: "text", text: `No element matching selector "${args.selector}" found.` }] };
            screenshotBuf = await loc.screenshot({ type: "png", timeout: 10000 }) as Buffer;
          } else {
            screenshotBuf = await session.page.screenshot({ type: "png", fullPage: false }) as Buffer;
          }
          imageDataUrl = `data:image/png;base64,${screenshotBuf.toString("base64")}`;
        } catch (err) {
          return { content: [{ type: "text", text: `Error capturing screenshot: ${err instanceof Error ? err.message : String(err)}` }] };
        }
      } else {
        return { content: [{ type: "text", text: "Error: Provide either image_url or sessionId. image_url takes a public image URL; sessionId screenshots the current browser page." }] };
      }

      // Call Kimi vision model for OCR
      try {
        const client = new OpenAI({ apiKey: kimiKey, baseURL: "https://api.moonshot.ai/v1" });
        const response = await client.chat.completions.create({
          model: "kimi-k2.5",
          max_tokens: 4096,
          messages: [
            { role: "system", content: "You are a precise text extraction assistant. Extract text from images accurately, preserving formatting and structure." },
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: imageDataUrl } },
                { type: "text", text: args.prompt },
              ] as any,
            },
          ],
          // @ts-ignore - Kimi specific parameter
          thinking: { type: "disabled" },
        });
        const extracted = response.choices?.[0]?.message?.content || "No text could be extracted.";
        return { content: [{ type: "text", text: `Extracted text:\n\n${extracted}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error during text extraction: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  return server;
}

function resolveKey(req: Request): string | undefined {
  // Support OAuth Bearer token (Authorization: Bearer sk_live_...)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token.startsWith("sk_live_")) return token;
  }
  return (
    (req.headers["x-api-key"] as string | undefined) ||
    (req.params.key as string | undefined) ||
    (req.query.key as string | undefined) ||
    // Smithery's default config parameter template publishes us with
    // `?apiKey={apiKey}` in the gateway URL. Accept it as a synonym for `key`.
    (req.query.apiKey as string | undefined)
  );
}

async function handleMcp(req: Request, res: Response, body: unknown) {
  const apiKey = resolveKey(req);

  // If no API key resolved, return 401 with OAuth hint so MCP clients
  // can discover the authorization server and start the OAuth flow.
  if (!apiKey) {
    const appUrl = process.env.APP_URL || "https://screenshotsmcp-api-production.up.railway.app";
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${appUrl}/.well-known/oauth-protected-resource"`);
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized — API key or OAuth Bearer token required" },
      id: null,
    });
    return;
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createMcpServer(apiKey);
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req as never, res as never, body);
}

mcpRouter.post("/", (req, res) => handleMcp(req, res, req.body));
mcpRouter.get("/", (req, res) => handleMcp(req, res, {}));
mcpRouter.post("/:key", (req, res) => handleMcp(req, res, req.body));
mcpRouter.get("/:key", (req, res) => handleMcp(req, res, {}));
