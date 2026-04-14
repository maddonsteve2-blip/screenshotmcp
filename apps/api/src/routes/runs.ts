import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { apiKeys, runs, users } from "@screenshotsmcp/db";
import { db } from "../lib/db.js";
import { getSession } from "../lib/sessions.js";

export const runsRouter = Router();

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
