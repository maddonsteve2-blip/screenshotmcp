import { Browser, BrowserContext, Page } from "playwright";
import { nanoid } from "nanoid";
import { browserPool } from "./browser-pool.js";
import { STEALTH_SCRIPT, DEFAULT_USER_AGENT } from "./stealth.js";

export interface NetworkEntry {
  url: string;
  method: string;
  status: number;
  statusText: string;
  resourceType: string;
  duration: number;
  size: number;
  ts: number;
}

export interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  lastUsed: Date;
  userId: string;
  release: () => Promise<void>;
  consoleLogs: Array<{ level: string; text: string; ts: number }>;
  networkErrors: Array<{ url: string; status: number; statusText: string; ts: number }>;
  networkRequests: NetworkEntry[];
}

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 10;

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsed.getTime() > SESSION_TTL_MS) {
      session.context.close().catch(() => {});
      session.release().catch(() => {});
      sessions.delete(id);
      console.log(`[Sessions] Expired session ${id}`);
    }
  }
}, 30_000);

function attachPageListeners(page: Page, session: Pick<Session, "consoleLogs" | "networkErrors" | "networkRequests">) {
  const requestTimings = new Map<string, number>();

  page.on("console", (msg) => {
    const level = msg.type();
    if (["error", "warning", "log"].includes(level)) {
      session.consoleLogs.push({ level, text: msg.text(), ts: Date.now() });
      if (session.consoleLogs.length > 200) session.consoleLogs.shift();
    }
  });

  page.on("pageerror", (err) => {
    session.consoleLogs.push({ level: "exception", text: err.message, ts: Date.now() });
    if (session.consoleLogs.length > 200) session.consoleLogs.shift();
  });

  page.on("request", (request) => {
    requestTimings.set(request.url(), Date.now());
  });

  page.on("response", (response) => {
    const url = response.url();
    const startTime = requestTimings.get(url) || Date.now();
    const duration = Date.now() - startTime;
    requestTimings.delete(url);

    const entry: NetworkEntry = {
      url,
      method: response.request().method(),
      status: response.status(),
      statusText: response.statusText(),
      resourceType: response.request().resourceType(),
      duration,
      size: Number(response.headers()["content-length"] || 0),
      ts: Date.now(),
    };

    session.networkRequests.push(entry);
    if (session.networkRequests.length > 500) session.networkRequests.shift();

    if (response.status() >= 400) {
      session.networkErrors.push({ url, status: response.status(), statusText: response.statusText(), ts: Date.now() });
      if (session.networkErrors.length > 100) session.networkErrors.shift();
    }
  });
}

export async function createSession(userId: string): Promise<string> {
  const sessionId = nanoid();
  // Enforce max session limit — close oldest
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].lastUsed.getTime() - b[1].lastUsed.getTime())[0];
    if (oldest) {
      await oldest[1].context.close().catch(() => {});
      await oldest[1].release().catch(() => {});
      sessions.delete(oldest[0]);
    }
  }

  const { browser, release } = await browserPool.acquire();
  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();
  await page.addInitScript(STEALTH_SCRIPT);

  const consoleLogs: Session["consoleLogs"] = [];
  const networkErrors: Session["networkErrors"] = [];
  const networkRequests: NetworkEntry[] = [];

  const session: Session = { browser, context, page, lastUsed: new Date(), userId, release, consoleLogs, networkErrors, networkRequests };
  attachPageListeners(page, session);

  sessions.set(sessionId, session);
  return sessionId;
}

export async function getSession(sessionId: string, userId: string): Promise<Session | null> {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) return null;
  session.lastUsed = new Date();

  // Health check: if the page or context is dead, try to recover
  try {
    // Quick liveness test — if this throws, page/context is dead
    await session.page.evaluate('1');
  } catch {
    console.log(`[Sessions] Page dead in session ${sessionId}, recovering...`);
    try {
      // Try closing old context gracefully
      await session.context.close().catch(() => {});
      // Create fresh context + page on the same browser
      const context = await session.browser.newContext({
        userAgent: DEFAULT_USER_AGENT,
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
      });
      const page = await context.newPage();
      await page.addInitScript(STEALTH_SCRIPT);
      session.context = context;
      session.page = page;
      // Re-attach listeners
      attachPageListeners(page, session);
      console.log(`[Sessions] Recovered session ${sessionId}`);
    } catch (recoverErr) {
      console.error(`[Sessions] Failed to recover session ${sessionId}:`, recoverErr);
      // Kill the session entirely
      await session.release().catch(() => {});
      sessions.delete(sessionId);
      return null;
    }
  }

  return session;
}

export async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (session) {
    await session.context.close().catch(() => {});
    await session.release().catch(() => {});
    sessions.delete(sessionId);
  }
}

export async function pageScreenshot(page: Page): Promise<{ type: "image"; data: string; mimeType: string }> {
  const buf = await page.screenshot({ type: "jpeg", quality: 80, fullPage: true, timeout: 15000 });
  return { type: "image", data: Buffer.from(buf).toString("base64"), mimeType: "image/jpeg" };
}

/**
 * Navigate to a URL with networkidle wait + hydration delay.
 * Falls back to load if networkidle times out.
 * Retries once on transient failure.
 */
export async function navigateWithRetry(
  page: Page,
  url: string,
  opts: { timeout?: number; waitAfter?: number } = {},
): Promise<void> {
  const timeout = opts.timeout ?? 30000;
  const waitAfter = opts.waitAfter ?? 1500;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout });
      // Extra hydration wait for SPAs
      await page.waitForTimeout(waitAfter);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 0 && !msg.includes("closed")) {
        console.log(`[Sessions] Navigate attempt 1 failed (${msg.slice(0, 80)}), retrying with 'load'...`);
        try {
          await page.goto(url, { waitUntil: "load", timeout });
          await page.waitForTimeout(waitAfter);
          return;
        } catch {
          // fall through to throw
        }
      }
      throw err;
    }
  }
}

export function sessionCount(): number {
  return sessions.size;
}
