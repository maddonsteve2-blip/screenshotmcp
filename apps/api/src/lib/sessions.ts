import { chromium, Browser, BrowserContext, Page } from "playwright";
import { nanoid } from "nanoid";

interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  lastUsed: Date;
  userId: string;
}

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSIONS = 3;

const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  window.chrome = { runtime: {} };
`;

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsed.getTime() > SESSION_TTL_MS) {
      session.browser.close().catch(() => {
        try { const pid = session.browser.process()?.pid; if (pid) process.kill(pid, "SIGKILL"); } catch {}
      });
      sessions.delete(id);
    }
  }
}, 30_000);

export async function createSession(userId: string): Promise<string> {
  const sessionId = nanoid();
  // Enforce max session limit
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].lastUsed.getTime() - b[1].lastUsed.getTime())[0];
    if (oldest) {
      oldest[1].browser.close().catch(() => {});
      sessions.delete(oldest[0]);
    }
  }
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--single-process",
    ],
    timeout: 15000,
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();
  await page.addInitScript(STEALTH_SCRIPT);
  sessions.set(sessionId, { browser, context, page, lastUsed: new Date(), userId });
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
