import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import { createHash } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { apiKeys, recordings, runs, screenshots, users } from "@screenshotsmcp/db";
import { db } from "../lib/db.js";
import { getPresignedUrl } from "../lib/r2.js";
import { getSession } from "../lib/sessions.js";

const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET || "").trim();

type AuthResult = {
  userId: string;
};

type DashboardSubscription =
  | { channel: "screenshots" }
  | { channel: "recordings" }
  | { channel: "artifacts" }
  | { channel: "run-live"; runId: string };

async function authenticateWs(req: { url?: string }): Promise<AuthResult | null> {
  try {
    const url = new URL(req.url || "", "http://localhost");
    const token = url.searchParams.get("token");
    const internal = url.searchParams.get("internal");

    if (internal && INTERNAL_SECRET) {
      const [secret, userId] = internal.split(":");
      if (secret === INTERNAL_SECRET && userId) {
        const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
        if (user) return { userId: user.id };
      }
    }

    if (token) {
      const hash = createHash("sha256").update(token).digest("hex");
      const [key] = await db
        .select({ userId: apiKeys.userId, revoked: apiKeys.revoked })
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, hash));
      if (key && !key.revoked) {
        return { userId: key.userId };
      }
    }
  } catch (error) {
    console.error("[dashboard-ws] Auth error:", error);
  }

  return null;
}

function parseSubscription(value: unknown): DashboardSubscription | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as { channel?: string; runId?: string };

  if (candidate.channel === "screenshots") return { channel: "screenshots" };
  if (candidate.channel === "recordings") return { channel: "recordings" };
  if (candidate.channel === "artifacts") return { channel: "artifacts" };
  if (candidate.channel === "run-live" && candidate.runId?.trim()) {
    return { channel: "run-live", runId: candidate.runId.trim() };
  }

  return null;
}

async function getScreenshotsData(userId: string) {
  const rows = await db
    .select({
      id: screenshots.id,
      sessionId: screenshots.sessionId,
      url: screenshots.url,
      status: screenshots.status,
      publicUrl: screenshots.publicUrl,
      width: screenshots.width,
      height: screenshots.height,
      fullPage: screenshots.fullPage,
      format: screenshots.format,
      createdAt: screenshots.createdAt,
      completedAt: screenshots.completedAt,
      shareToken: runs.shareToken,
      sharedAt: runs.sharedAt,
    })
    .from(screenshots)
    .leftJoin(runs, eq(screenshots.sessionId, runs.id))
    .where(eq(screenshots.userId, userId))
    .orderBy(desc(screenshots.createdAt))
    .limit(100);

  return { screenshots: rows };
}

async function getRecordingsData(userId: string, sessionId?: string) {
  const rows = await db
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
      shareToken: runs.shareToken,
      sharedAt: runs.sharedAt,
    })
    .from(recordings)
    .leftJoin(runs, eq(recordings.sessionId, runs.id))
    .where(
      sessionId
        ? and(eq(recordings.userId, userId), eq(recordings.sessionId, sessionId))
        : eq(recordings.userId, userId),
    )
    .orderBy(desc(recordings.createdAt))
    .limit(50);

  const items = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      sessionId: row.sessionId,
      pageUrl: row.pageUrl,
      fileSize: row.fileSize,
      durationMs: row.durationMs,
      viewportWidth: row.viewportWidth,
      viewportHeight: row.viewportHeight,
      createdAt: row.createdAt,
      shareToken: row.shareToken,
      sharedAt: row.sharedAt,
      videoUrl: await getPresignedUrl(row.r2Key, 3600),
    })),
  );

  return { recordings: items };
}

async function getRunLiveData(userId: string, runId: string) {
  const [run] = await db
    .select({ id: runs.id, status: runs.status, recordingEnabled: runs.recordingEnabled, startedAt: runs.startedAt })
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)));

  if (!run) {
    throw new Error("Run not found");
  }

  const session = await getSession(runId, userId);
  if (!session) {
    return {
      runId,
      status: run.status,
      live: false,
      snapshotAt: new Date().toISOString(),
    };
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

  return {
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
  };
}

async function getArtifactsData(userId: string) {
  const [screenshotsData, recordingsData] = await Promise.all([
    getScreenshotsData(userId),
    getRecordingsData(userId),
  ]);

  return {
    screenshots: screenshotsData.screenshots,
    recordings: recordingsData.recordings,
  };
}

async function getSubscriptionPayload(auth: AuthResult, subscription: DashboardSubscription) {
  switch (subscription.channel) {
    case "screenshots":
      return { type: "screenshots", data: await getScreenshotsData(auth.userId) };
    case "recordings":
      return { type: "recordings", data: await getRecordingsData(auth.userId) };
    case "artifacts":
      return { type: "artifacts", data: await getArtifactsData(auth.userId) };
    case "run-live":
      return { type: "run-live", data: await getRunLiveData(auth.userId, subscription.runId) };
  }
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function attachDashboardWs(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  const handleConnection = (ws: WebSocket, auth: AuthResult) => {
    let subscription: DashboardSubscription | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const clearRefreshTimer = () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    };

    const pushCurrentSubscription = async () => {
      if (!subscription) return;

      try {
        const payload = await getSubscriptionPayload(auth, subscription);
        sendJson(ws, payload);

        if (
          subscription.channel === "run-live" &&
          payload.type === "run-live" &&
          payload.data &&
          typeof payload.data === "object" &&
          "live" in payload.data &&
          !payload.data.live &&
          "status" in payload.data &&
          payload.data.status !== "active"
        ) {
          clearRefreshTimer();
        }
      } catch (error) {
        sendJson(ws, {
          type: "error",
          channel: subscription.channel,
          message: error instanceof Error ? error.message : "Failed to load dashboard data",
        });
      }
    };

    const scheduleRefresh = () => {
      clearRefreshTimer();
      if (!subscription) return;
      if (subscription.channel !== "run-live") return;

      refreshTimer = setInterval(() => {
        void pushCurrentSubscription();
      }, 5000);
    };

    ws.on("message", async (raw) => {
      try {
        const parsed = JSON.parse(String(raw)) as { type?: string; channel?: string; runId?: string };

        if (parsed.type === "subscribe") {
          const nextSubscription = parseSubscription(parsed);
          if (!nextSubscription) {
            sendJson(ws, { type: "error", message: "Invalid subscription request" });
            return;
          }

          subscription = nextSubscription;
          await pushCurrentSubscription();
          scheduleRefresh();
          return;
        }

        if (parsed.type === "refresh") {
          await pushCurrentSubscription();
        }
      } catch {
        sendJson(ws, { type: "error", message: "Invalid dashboard socket payload" });
      }
    });

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on("close", () => {
      clearInterval(ping);
      clearRefreshTimer();
    });
  };

  server.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url || "", "http://localhost");
    if (url.pathname !== "/ws/dashboard") return;

    const auth = await authenticateWs(req);
    if (!auth) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, auth);
    });
  });

  console.log("[dashboard-ws] WebSocket endpoint ready at /ws/dashboard");
}
