import { Browser, BrowserContext, Page } from "playwright";
import { nanoid } from "nanoid";
import { browserPool } from "./browser-pool.js";
import { STEALTH_SCRIPT, DEFAULT_USER_AGENT } from "./stealth.js";

export interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  lastUsed: Date;
  userId: string;
  release: () => Promise<void>;
  consoleLogs: Array<{ level: string; text: string; ts: number }>;
  networkErrors: Array<{ url: string; status: number; statusText: string; ts: number }>;
}

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSIONS = 6;

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

  // Capture console messages
  page.on("console", (msg) => {
    const level = msg.type();
    if (["error", "warning", "log"].includes(level)) {
      consoleLogs.push({ level, text: msg.text(), ts: Date.now() });
      if (consoleLogs.length > 200) consoleLogs.shift();
    }
  });

  // Capture JS errors
  page.on("pageerror", (err) => {
    consoleLogs.push({ level: "exception", text: err.message, ts: Date.now() });
    if (consoleLogs.length > 200) consoleLogs.shift();
  });

  // Capture failed network requests
  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkErrors.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        ts: Date.now(),
      });
      if (networkErrors.length > 100) networkErrors.shift();
    }
  });

  sessions.set(sessionId, { browser, context, page, lastUsed: new Date(), userId, release, consoleLogs, networkErrors });
  return sessionId;
}

export async function getSession(sessionId: string, userId: string): Promise<Session | null> {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) return null;
  session.lastUsed = new Date();
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
  const buf = await page.screenshot({ type: "jpeg", quality: 50 });
  return { type: "image", data: Buffer.from(buf).toString("base64"), mimeType: "image/jpeg" };
}

export function sessionCount(): number {
  return sessions.size;
}
