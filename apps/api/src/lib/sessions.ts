import { Browser, BrowserContext, Page } from "playwright";
import { nanoid } from "nanoid";
import { browserPool } from "./browser-pool.js";
import { STEALTH_SCRIPT, DEFAULT_USER_AGENT } from "./stealth.js";
import { uploadScreenshot } from "./r2.js";
import { db } from "./db.js";
import { recordings } from "@screenshotsmcp/db";
import { existsSync } from "fs";
import { readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

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
  recording: boolean;
  videoDir?: string;
  videoUrl?: string;
  startUrl?: string;
  startTime: number;
}

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 10;

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsed.getTime() > SESSION_TTL_MS) {
      // Use closeSession to handle video upload for recorded sessions
      closeSession(id).catch(() => {});
      console.log(`[Sessions] Expired session ${id}${session.recording ? " (recording)" : ""}`);
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

export async function createSession(userId: string, viewport?: { width: number; height: number }, recordVideo?: boolean): Promise<string> {
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

  const vp = viewport || { width: 1280, height: 800 };
  const { browser, release } = await browserPool.acquire();

  // Video recording setup
  const videoDir = recordVideo ? join(tmpdir(), `smcp-video-${sessionId}`) : undefined;
  const contextOpts: any = {
    userAgent: DEFAULT_USER_AGENT,
    viewport: vp,
    locale: "en-US",
  };
  if (recordVideo && videoDir) {
    contextOpts.recordVideo = { dir: videoDir, size: vp };
  }

  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  await page.addInitScript(STEALTH_SCRIPT);

  const consoleLogs: Session["consoleLogs"] = [];
  const networkErrors: Session["networkErrors"] = [];
  const networkRequests: NetworkEntry[] = [];

  const session: Session = { browser, context, page, lastUsed: new Date(), userId, release, consoleLogs, networkErrors, networkRequests, recording: !!recordVideo, videoDir, startTime: Date.now() };
  attachPageListeners(page, session);

  sessions.set(sessionId, session);
  return sessionId;
}

export async function setSessionViewport(sessionId: string, userId: string, width: number, height: number): Promise<boolean> {
  const session = await getSession(sessionId, userId);
  if (!session) return false;
  await session.page.setViewportSize({ width, height });
  return true;
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

export async function closeSession(sessionId: string): Promise<{ videoUrl?: string; r2Key?: string; recordingId?: string }> {
  const session = sessions.get(sessionId);
  if (!session) return {};

  let videoUrl: string | undefined;
  let r2Key: string | undefined;
  let recordingId: string | undefined;

  // If recording, extract the video before closing context
  if (session.recording) {
    try {
      // Get the video path from the page (must be done before context.close)
      const video = session.page.video();
      const vpSize = session.page.viewportSize();
      if (video) {
        const videoPath = await video.path();
        // Close context first — this finalizes the video file
        await session.context.close().catch(() => {});

        // Wait briefly for file to be fully written
        await new Promise(r => setTimeout(r, 500));

        if (videoPath && existsSync(videoPath)) {
          const videoBuffer = await readFile(videoPath);
          r2Key = `recordings/${sessionId}.webm`;
          videoUrl = await uploadScreenshot(r2Key, videoBuffer, "video/webm");
          session.videoUrl = videoUrl;
          const durationMs = Date.now() - session.startTime;
          console.log(`[Sessions] Video uploaded: ${r2Key} (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB, ${(durationMs / 1000).toFixed(0)}s)`);

          // Save recording metadata to DB
          recordingId = nanoid();
          await db.insert(recordings).values({
            id: recordingId,
            userId: session.userId,
            sessionId,
            r2Key,
            pageUrl: session.startUrl || null,
            fileSize: videoBuffer.length,
            durationMs,
            viewportWidth: vpSize?.width || 1280,
            viewportHeight: vpSize?.height || 800,
          }).catch(err => console.error(`[Sessions] Failed to save recording metadata:`, err));

          // Cleanup temp files
          await rm(session.videoDir!, { recursive: true, force: true }).catch(() => {});
        }
      } else {
        await session.context.close().catch(() => {});
      }
    } catch (err) {
      console.error(`[Sessions] Video upload failed for ${sessionId}:`, err);
      await session.context.close().catch(() => {});
    }
  } else {
    await session.context.close().catch(() => {});
  }

  await session.release().catch(() => {});
  sessions.delete(sessionId);
  return { videoUrl, r2Key, recordingId };
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
