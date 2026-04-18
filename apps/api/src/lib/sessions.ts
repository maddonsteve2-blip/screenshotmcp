import { Browser, BrowserContext, Page } from "playwright";
import { nanoid } from "nanoid";
import { browserPool } from "./browser-pool.js";
import { STEALTH_SCRIPT, DEFAULT_USER_AGENT } from "./stealth.js";
import { uploadScreenshot } from "./r2.js";
import { db } from "./db.js";
import { recordings, runs, screenshots } from "@screenshotsmcp/db";
import { persistInitialRunOutcome, persistRunOutcomeSnapshot, type RunOutcomeContext, normalizeOutcomeContext } from "./run-outcomes.js";
import { emitWebhookEvent } from "./webhook-delivery.js";
import { existsSync } from "fs";
import { readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { eq } from "drizzle-orm";
import { deriveCaption } from "./captions.js";

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
  /** Monotonic counter for narrated-timeline step indices. */
  screenshotSeq: number;
  recording: boolean;
  videoDir?: string;
  videoUrl?: string;
  startUrl?: string;
  startTime: number;
  outcomeContext?: RunOutcomeContext | null;
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

function getSessionEntryByPage(page: Page): { sessionId: string; session: Session } | null {
  for (const [sessionId, session] of sessions.entries()) {
    if (session.page === page) {
      return { sessionId, session };
    }
  }
  return null;
}

async function persistRunDiagnostics(
  sessionId: string,
  session: Session,
  status: "active" | "completed" | "failed",
  endedAt?: Date,
  pageSnapshot?: { finalUrl: string | null; pageTitle: string | null },
): Promise<void> {
  const finalUrl = pageSnapshot?.finalUrl ?? (() => {
    try {
      return session.page.url() || session.startUrl || null;
    } catch {
      return session.startUrl || null;
    }
  })();
  const pageTitle = pageSnapshot?.pageTitle ?? await session.page.title().catch(() => null);
  const consoleErrorCount = session.consoleLogs.filter((entry) => entry.level === "error" || entry.level === "exception").length;
  const consoleWarningCount = session.consoleLogs.filter((entry) => entry.level === "warning").length;

  await db
    .update(runs)
    .set({
      status,
      startUrl: session.startUrl ?? null,
      finalUrl,
      pageTitle,
      consoleLogs: JSON.stringify(session.consoleLogs),
      networkErrors: JSON.stringify(session.networkErrors),
      networkRequests: JSON.stringify(session.networkRequests),
      consoleLogCount: session.consoleLogs.length,
      consoleErrorCount,
      consoleWarningCount,
      networkRequestCount: session.networkRequests.length,
      networkErrorCount: session.networkErrors.length,
      endedAt: endedAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(runs.id, sessionId))
    .catch((err) => console.error(`[Sessions] Failed to persist run diagnostics for ${sessionId}:`, err));

  await persistRunOutcomeSnapshot({
    runId: sessionId,
    userId: session.userId,
    status,
    recordingEnabled: session.recording,
    outcomeContext: session.outcomeContext,
    consoleLogs: session.consoleLogs,
    networkErrors: session.networkErrors,
    networkRequests: session.networkRequests,
    screenshotCount: (await db
      .select({ id: screenshots.id })
      .from(screenshots)
      .where(eq(screenshots.sessionId, sessionId))).length,
    recordingCount: (await db
      .select({ id: recordings.id })
      .from(recordings)
      .where(eq(recordings.sessionId, sessionId))).length,
  }).catch((err) => console.error(`[Sessions] Failed to persist run outcome for ${sessionId}:`, err));
}

export async function createSession(userId: string, viewport?: { width: number; height: number }, recordVideo?: boolean, outcomeContext?: RunOutcomeContext | null): Promise<string> {
  const sessionId = nanoid();
  // Enforce max session limit — close oldest
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].lastUsed.getTime() - b[1].lastUsed.getTime())[0];
    if (oldest) {
      await closeSession(oldest[0]).catch(() => {});
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

  const session: Session = { browser, context, page, lastUsed: new Date(), userId, release, consoleLogs, networkErrors, networkRequests, recording: !!recordVideo, screenshotSeq: 0, videoDir, startTime: Date.now(), outcomeContext: normalizeOutcomeContext(outcomeContext) };
  await db.insert(runs).values({
    id: sessionId,
    userId,
    status: "active",
    executionMode: "remote",
    recordingEnabled: !!recordVideo,
    viewportWidth: vp.width,
    viewportHeight: vp.height,
    startedAt: new Date(),
    updatedAt: new Date(),
  });
  await persistInitialRunOutcome(sessionId, userId, session.outcomeContext).catch((err) => console.error(`[Sessions] Failed to persist initial run outcome for ${sessionId}:`, err));
  attachPageListeners(page, session);

  sessions.set(sessionId, session);
  return sessionId;
}

export async function setSessionStartUrl(sessionId: string, userId: string, url: string): Promise<void> {
  const session = await getSession(sessionId, userId);
  if (!session) return;
  session.startUrl = url;
  await db
    .update(runs)
    .set({ startUrl: url, updatedAt: new Date() })
    .where(eq(runs.id, sessionId));
}

export async function setSessionViewport(sessionId: string, userId: string, width: number, height: number): Promise<boolean> {
  const session = await getSession(sessionId, userId);
  if (!session) return false;
  await session.page.setViewportSize({ width, height });
  await db
    .update(runs)
    .set({ viewportWidth: width, viewportHeight: height, updatedAt: new Date() })
    .where(eq(runs.id, sessionId))
    .catch((err) => console.error(`[Sessions] Failed to update viewport for ${sessionId}:`, err));
  return true;
}

export async function setSessionOutcomeContext(sessionId: string, userId: string, outcomeContext: RunOutcomeContext | null): Promise<boolean> {
  const session = await getSession(sessionId, userId);
  if (!session) return false;
  session.outcomeContext = normalizeOutcomeContext(outcomeContext);
  await persistInitialRunOutcome(sessionId, userId, session.outcomeContext).catch((err) => console.error(`[Sessions] Failed to update run outcome context for ${sessionId}:`, err));
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
      await persistRunDiagnostics(sessionId, session, "failed", new Date());
      await session.release().catch(() => {});
      sessions.delete(sessionId);
      return null;
    }
  }

  return session;
}

export async function closeSession(sessionId: string): Promise<{ videoUrl?: string; r2Key?: string; recordingId?: string; finalizationError?: string }> {
  const session = sessions.get(sessionId);
  if (!session) return {};

  let videoUrl: string | undefined;
  let r2Key: string | undefined;
  let recordingId: string | undefined;
  let finalizationError: string | undefined;
  const endedAt = new Date();
  const pageSnapshot = {
    finalUrl: (() => {
      try {
        return session.page.url() || session.startUrl || null;
      } catch {
        return session.startUrl || null;
      }
    })(),
    pageTitle: await session.page.title().catch(() => null),
  };

  // If recording, extract the video before closing context
  if (session.recording) {
    let recordingStage = "capture video";
    try {
      // Get the video path from the page (must be done before context.close)
      const video = session.page.video();
      const vpSize = session.page.viewportSize();
      if (video) {
        const finalizedVideoPath = join(session.videoDir ?? tmpdir(), `${sessionId}-final.webm`);
        recordingStage = "close browser context";

        // Close context first — this finalizes the video file
        await session.context.close().catch(() => {});

        recordingStage = "save finalized video";
        await video.saveAs(finalizedVideoPath);

        if (finalizedVideoPath && existsSync(finalizedVideoPath)) {
          const videoBuffer = await readFile(finalizedVideoPath);
          if (videoBuffer.length === 0) {
            throw new Error("Recording finalized with an empty video file.");
          }

          recordingStage = "upload video";
          r2Key = `recordings/${sessionId}.webm`;
          videoUrl = await uploadScreenshot(r2Key, videoBuffer, "video/webm");
          session.videoUrl = videoUrl;
          const durationMs = Date.now() - session.startTime;
          console.log(`[Sessions] Video uploaded: ${r2Key} (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB, ${(durationMs / 1000).toFixed(0)}s)`);

          // Save recording metadata to DB
          recordingStage = "persist recording metadata";
          const nextRecordingId = nanoid();
          await db.insert(recordings).values({
            id: nextRecordingId,
            userId: session.userId,
            sessionId,
            r2Key,
            pageUrl: session.startUrl || null,
            fileSize: videoBuffer.length,
            durationMs,
            viewportWidth: vpSize?.width || 1280,
            viewportHeight: vpSize?.height || 800,
          });
          recordingId = nextRecordingId;

          // Cleanup temp files
          await rm(session.videoDir!, { recursive: true, force: true }).catch(() => {});
        } else {
          throw new Error("Recording file was not available after browser context closed.");
        }
      } else {
        await session.context.close().catch(() => {});
      }
    } catch (err) {
      console.error(`[Sessions] Recording finalization failed for ${sessionId} during ${recordingStage}:`, err);
      finalizationError = err instanceof Error ? err.message : String(err);
      await session.context.close().catch(() => {});
    }
  } else {
    await session.context.close().catch(() => {});
  }

  await persistRunDiagnostics(sessionId, session, "completed", endedAt, pageSnapshot);

  if (finalizationError) {
    await persistRunOutcomeSnapshot({
      runId: sessionId,
      userId: session.userId,
      status: "completed",
      recordingEnabled: session.recording,
      outcomeContext: session.outcomeContext,
      consoleLogs: session.consoleLogs,
      networkErrors: session.networkErrors,
      networkRequests: session.networkRequests,
      screenshotCount: (await db
        .select({ id: screenshots.id })
        .from(screenshots)
        .where(eq(screenshots.sessionId, sessionId))).length,
      recordingCount: (await db
        .select({ id: recordings.id })
        .from(recordings)
        .where(eq(recordings.sessionId, sessionId))).length,
      finalizationError,
    }).catch((err) => console.error(`[Sessions] Failed to persist final run outcome for ${sessionId}:`, err));
  }

  await session.release().catch(() => {});
  sessions.delete(sessionId);

  // Best-effort webhook fanout. We treat any finalization error as `run.failed`,
  // otherwise `run.completed`. Subscribers can use this to trigger downstream
  // automations (Slack pings, Linear tickets, GitHub PR comments, etc.).
  void emitWebhookEvent({
    userId: session.userId,
    eventType: finalizationError ? "run.failed" : "run.completed",
    dedupeKey: `${finalizationError ? "run.failed" : "run.completed"}:${sessionId}`,
    payload: {
      runId: sessionId,
      finalUrl: pageSnapshot?.finalUrl ?? null,
      pageTitle: pageSnapshot?.pageTitle ?? null,
      recordingEnabled: session.recording,
      videoUrl: videoUrl ?? null,
      consoleErrorCount: session.consoleLogs.filter((l) => l.level === "error").length,
      networkErrorCount: session.networkErrors.length,
      finalizationError: finalizationError ?? null,
    },
  }).catch((err) => console.warn(`[webhooks] emit run event failed:`, err));

  return { videoUrl, r2Key, recordingId, finalizationError };
}

export interface NarrationContext {
  toolName?: string;
  prevUrl?: string | null;
  prevTitle?: string | null;
  prevHeading?: string | null;
  arg?: string | null;
  arg2?: string | null;
  agentNote?: string | null;
}

export async function pageScreenshot(
  page: Page,
  narration: NarrationContext = {},
): Promise<{ type: "image"; data: string; mimeType: string }> {
  const buf = await page.screenshot({ type: "jpeg", quality: 80, fullPage: true, timeout: 15000 });
  const sessionEntry = getSessionEntryByPage(page);
  if (sessionEntry) {
    const screenshotId = nanoid();
    const r2Key = `runs/${sessionEntry.sessionId}/screenshots/${screenshotId}.jpeg`;
    const publicUrl = await uploadScreenshot(r2Key, buf, "image/jpeg");
    const viewport = page.viewportSize();

    const nextUrl = page.url();
    let nextTitle: string | null = null;
    let nextHeading: string | null = null;
    try {
      nextTitle = await page.title();
    } catch { /* ignore */ }
    try {
      nextHeading = await page.evaluate(() => {
        const h = document.querySelector("h1,h2");
        return h ? (h.textContent || "").trim().slice(0, 200) : null;
      });
    } catch { /* ignore */ }

    const caption = deriveCaption({
      toolName: narration.toolName || "browser_screenshot",
      prevUrl: narration.prevUrl,
      nextUrl,
      prevTitle: narration.prevTitle,
      nextTitle,
      prevHeading: narration.prevHeading,
      nextHeading,
      arg: narration.arg,
      arg2: narration.arg2,
      agentNote: narration.agentNote,
    });

    // Monotonic step index within this run.
    const stepIndex = ++sessionEntry.session.screenshotSeq;

    await db.insert(screenshots).values({
      id: screenshotId,
      userId: sessionEntry.session.userId,
      sessionId: sessionEntry.sessionId,
      url: nextUrl,
      status: "done",
      r2Key,
      publicUrl,
      width: viewport?.width ?? 1280,
      height: viewport?.height,
      fullPage: true,
      format: "jpeg",
      delay: 0,
      stepIndex,
      actionLabel: caption.actionLabel,
      outcome: caption.outcome,
      toolName: narration.toolName ?? "browser_screenshot",
      captionSource: caption.captionSource,
      agentNote: narration.agentNote ?? null,
      prevUrl: narration.prevUrl ?? null,
      pageTitle: nextTitle,
      heading: nextHeading,
      completedAt: new Date(),
    }).catch((err) => console.error(`[Sessions] Failed to persist session screenshot for ${sessionEntry.sessionId}:`, err));
  }
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
