import { Router } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { apiKeys, recordings, runs, screenshots, users } from "@screenshotsmcp/db";
import { db } from "../lib/db.js";
import { getSession } from "../lib/sessions.js";
import { getPresignedUrl } from "../lib/r2.js";

export const runsRouter = Router();

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function resolveUser(req: any): Promise<{ userId: string } | null> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token.startsWith("user_")) {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, token));
      if (user) return { userId: user.id };
    }
  }

  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (apiKey) {
    const keyHash = createHash("sha256").update(apiKey).digest("hex");
    const [row] = await db
      .select({ userId: apiKeys.userId })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.revoked, false)));
    if (row) return { userId: row.userId };
  }

  return null;
}

runsRouter.get("/:id/live", async (req, res) => {
  const auth = await resolveUser(req);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const runId = req.params.id;
  const [run] = await db
    .select({ id: runs.id, status: runs.status, recordingEnabled: runs.recordingEnabled, startedAt: runs.startedAt })
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, auth.userId)));

  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  const session = await getSession(runId, auth.userId);
  if (!session) {
    res.json({
      runId,
      status: run.status,
      live: false,
      snapshotAt: new Date().toISOString(),
    });
    return;
  }

  const viewport = session.page.viewportSize();
  const currentUrl = (() => {
    try {
      return session.page.url() || null;
    } catch {
      return null;
    }
  })();
  const pageTitle = await session.page.title().catch(() => null);

  res.json({
    runId,
    status: run.status,
    live: true,
    snapshotAt: new Date().toISOString(),
    startedAt: run.startedAt?.toISOString?.() ?? null,
    lastUsedAt: session.lastUsed.toISOString(),
    recordingEnabled: run.recordingEnabled,
    currentUrl,
    pageTitle,
    viewport: viewport ? { width: viewport.width, height: viewport.height } : null,
    consoleLogs: session.consoleLogs,
    networkErrors: session.networkErrors,
    networkRequests: session.networkRequests,
    consoleLogCount: session.consoleLogs.length,
    consoleErrorCount: session.consoleLogs.filter((entry) => entry.level === "error" || entry.level === "exception").length,
    consoleWarningCount: session.consoleLogs.filter((entry) => entry.level === "warning").length,
    networkRequestCount: session.networkRequests.length,
    networkErrorCount: session.networkErrors.length,
  });
});

runsRouter.get("/shared/:token", async (req, res) => {
  const token = req.params.token?.trim();
  if (!token) {
    res.status(400).json({ error: "Missing share token" });
    return;
  }

  const [run] = await db
    .select({
      id: runs.id,
      status: runs.status,
      executionMode: runs.executionMode,
      startUrl: runs.startUrl,
      finalUrl: runs.finalUrl,
      pageTitle: runs.pageTitle,
      recordingEnabled: runs.recordingEnabled,
      viewportWidth: runs.viewportWidth,
      viewportHeight: runs.viewportHeight,
      consoleLogs: runs.consoleLogs,
      networkErrors: runs.networkErrors,
      consoleLogCount: runs.consoleLogCount,
      consoleErrorCount: runs.consoleErrorCount,
      consoleWarningCount: runs.consoleWarningCount,
      networkRequestCount: runs.networkRequestCount,
      networkErrorCount: runs.networkErrorCount,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
      createdAt: runs.createdAt,
      sharedAt: runs.sharedAt,
    })
    .from(runs)
    .where(eq(runs.shareToken, token));

  if (!run) {
    res.status(404).json({ error: "Shared run not found" });
    return;
  }

  const screenshotRows = await db
    .select({
      id: screenshots.id,
      url: screenshots.url,
      status: screenshots.status,
      publicUrl: screenshots.publicUrl,
      width: screenshots.width,
      height: screenshots.height,
      format: screenshots.format,
      fullPage: screenshots.fullPage,
      createdAt: screenshots.createdAt,
    })
    .from(screenshots)
    .where(eq(screenshots.sessionId, run.id))
    .orderBy(asc(screenshots.createdAt));

  const recordingRows = await db
    .select({
      id: recordings.id,
      sessionId: recordings.sessionId,
      pageUrl: recordings.pageUrl,
      fileSize: recordings.fileSize,
      durationMs: recordings.durationMs,
      viewportWidth: recordings.viewportWidth,
      viewportHeight: recordings.viewportHeight,
      createdAt: recordings.createdAt,
      r2Key: recordings.r2Key,
    })
    .from(recordings)
    .where(eq(recordings.sessionId, run.id))
    .orderBy(desc(recordings.createdAt));

  const recordingsForShare = await Promise.all(
    recordingRows.map(async (recording) => ({
      id: recording.id,
      sessionId: recording.sessionId,
      pageUrl: recording.pageUrl,
      fileSize: recording.fileSize,
      durationMs: recording.durationMs,
      viewportWidth: recording.viewportWidth,
      viewportHeight: recording.viewportHeight,
      createdAt: recording.createdAt?.toISOString?.() ?? null,
      videoUrl: await getPresignedUrl(recording.r2Key, 3600),
    })),
  );

  res.json({
    run: {
      id: run.id,
      status: run.status,
      executionMode: run.executionMode,
      startUrl: run.startUrl,
      finalUrl: run.finalUrl,
      pageTitle: run.pageTitle,
      recordingEnabled: run.recordingEnabled,
      viewportWidth: run.viewportWidth,
      viewportHeight: run.viewportHeight,
      consoleLogCount: run.consoleLogCount,
      consoleErrorCount: run.consoleErrorCount,
      consoleWarningCount: run.consoleWarningCount,
      networkRequestCount: run.networkRequestCount,
      networkErrorCount: run.networkErrorCount,
      startedAt: run.startedAt?.toISOString?.() ?? null,
      endedAt: run.endedAt?.toISOString?.() ?? null,
      createdAt: run.createdAt?.toISOString?.() ?? null,
      sharedAt: run.sharedAt?.toISOString?.() ?? null,
    },
    screenshots: screenshotRows.map((screenshot) => ({
      ...screenshot,
      createdAt: screenshot.createdAt?.toISOString?.() ?? null,
    })),
    recordings: recordingsForShare,
    consoleLogs: parseJson(run.consoleLogs, []).slice(-20).reverse(),
    networkErrors: parseJson(run.networkErrors, []).slice(-20).reverse(),
  });
});
