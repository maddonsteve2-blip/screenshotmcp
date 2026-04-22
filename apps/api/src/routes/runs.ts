import { Router } from "express";
import { and, asc, desc, eq, ilike, inArray, lt, or, sql, count } from "drizzle-orm";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import { apiKeys, recordings, runOutcomes, runs, screenshots, users } from "@screenshotsmcp/db";
import { db } from "../lib/db.js";
import { getSession } from "../lib/sessions.js";
import { getPresignedUrl, uploadScreenshot } from "../lib/r2.js";
import { deriveCaption } from "../lib/captions.js";
import { emitDashboardEvent } from "../lib/dashboard-events.js";

export const runsRouter = Router();
const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET || "").trim();

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
  if (authHeader?.startsWith("Internal ") && INTERNAL_SECRET) {
    const token = authHeader.slice(9);
    const [secret, userId] = token.split(":");
    if (secret === INTERNAL_SECRET && userId) {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId));
      if (user) return { userId: user.id };
    }
  }

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

// GET /v1/runs — paginated library listing with search + status filter.
//
// Query params:
//   q       free-text match on pageTitle, startUrl, finalUrl, id
//   status  `active` | `completed` | `failed`
//   before  ISO cursor — rows with createdAt < before (falls back to startedAt)
//   limit   default 30, max 100
// Response: { items, nextCursor, total }
runsRouter.get("/", async (req, res) => {
  const auth = await resolveUser(req);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const rawLimit = Number.parseInt(String(req.query.limit ?? "30"), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;
  const beforeRaw = typeof req.query.before === "string" ? req.query.before.trim() : "";
  const before = beforeRaw ? new Date(beforeRaw) : null;

  const filters = [eq(runs.userId, auth.userId)];
  if (q) {
    const like = `%${q}%`;
    filters.push(
      or(
        ilike(runs.pageTitle, like),
        ilike(runs.startUrl, like),
        ilike(runs.finalUrl, like),
        ilike(runs.id, like),
      )!,
    );
  }
  if (status === "active" || status === "completed" || status === "failed") {
    filters.push(eq(runs.status, status));
  }

  const whereForTotal = and(...filters);
  const whereForPage = before && !Number.isNaN(before.getTime())
    ? and(...filters, lt(runs.createdAt, before))
    : whereForTotal;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: runs.id,
        status: runs.status,
        executionMode: runs.executionMode,
        startUrl: runs.startUrl,
        finalUrl: runs.finalUrl,
        pageTitle: runs.pageTitle,
        recordingEnabled: runs.recordingEnabled,
        shareToken: runs.shareToken,
        sharedAt: runs.sharedAt,
        viewportWidth: runs.viewportWidth,
        viewportHeight: runs.viewportHeight,
        consoleErrorCount: runs.consoleErrorCount,
        consoleWarningCount: runs.consoleWarningCount,
        networkRequestCount: runs.networkRequestCount,
        networkErrorCount: runs.networkErrorCount,
        startedAt: runs.startedAt,
        endedAt: runs.endedAt,
        createdAt: runs.createdAt,
      })
      .from(runs)
      .where(whereForPage)
      .orderBy(desc(runs.createdAt))
      .limit(limit + 1),
    db.select({ value: count() }).from(runs).where(whereForTotal),
  ]);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const ids = pageRows.map((r) => r.id);

  // Enrich the page with outcome + capture/replay counts so the list UI can
  // show verdict badges and evidence pills without a follow-up query per row.
  const [outcomeRows, captureCountRows, replayCountRows] = ids.length
    ? await Promise.all([
        db
          .select({
            runId: runOutcomes.runId,
            verdict: runOutcomes.verdict,
            summary: runOutcomes.summary,
            userGoal: runOutcomes.userGoal,
            workflowUsed: runOutcomes.workflowUsed,
          })
          .from(runOutcomes)
          .where(and(eq(runOutcomes.userId, auth.userId), inArray(runOutcomes.runId, ids))),
        db
          .select({ sessionId: screenshots.sessionId, value: count() })
          .from(screenshots)
          .where(and(eq(screenshots.userId, auth.userId), inArray(screenshots.sessionId, ids)))
          .groupBy(screenshots.sessionId),
        db
          .select({ sessionId: recordings.sessionId, value: count() })
          .from(recordings)
          .where(and(eq(recordings.userId, auth.userId), inArray(recordings.sessionId, ids)))
          .groupBy(recordings.sessionId),
      ])
    : [[], [], []];

  const outcomeByRun = new Map(outcomeRows.map((row) => [row.runId, row]));
  const captureCountByRun = new Map(captureCountRows.map((row) => [row.sessionId as string, Number(row.value)]));
  const replayCountByRun = new Map(replayCountRows.map((row) => [row.sessionId, Number(row.value)]));

  const items = pageRows.map((run) => ({
    ...run,
    outcome: outcomeByRun.get(run.id) ?? null,
    captureCount: captureCountByRun.get(run.id) ?? 0,
    replayCount: replayCountByRun.get(run.id) ?? 0,
  }));

  const nextCursor = hasMore ? items[items.length - 1].createdAt?.toISOString() ?? null : null;
  const total = Number(totalRows[0]?.value ?? 0);

  res.json({ items, nextCursor, total });
});

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
      stepIndex: screenshots.stepIndex,
      actionLabel: screenshots.actionLabel,
      outcome: screenshots.outcome,
      toolName: screenshots.toolName,
      captionSource: screenshots.captionSource,
      agentNote: screenshots.agentNote,
      pageTitle: screenshots.pageTitle,
      heading: screenshots.heading,
    })
    .from(screenshots)
    .where(eq(screenshots.sessionId, run.id))
    .orderBy(asc(screenshots.stepIndex), asc(screenshots.createdAt));

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

  const [outcome] = await db
    .select({
      taskType: runOutcomes.taskType,
      userGoal: runOutcomes.userGoal,
      workflowUsed: runOutcomes.workflowUsed,
      verdict: runOutcomes.verdict,
      problem: runOutcomes.problem,
      summary: runOutcomes.summary,
      contract: runOutcomes.contract,
      findings: runOutcomes.findings,
      proofCoverage: runOutcomes.proofCoverage,
      validity: runOutcomes.validity,
      nextActions: runOutcomes.nextActions,
    })
    .from(runOutcomes)
    .where(eq(runOutcomes.runId, run.id));

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
    outcome: outcome ? {
      taskType: outcome.taskType,
      userGoal: outcome.userGoal,
      workflowUsed: outcome.workflowUsed,
      verdict: outcome.verdict,
      problem: outcome.problem,
      summary: outcome.summary,
      contract: parseJson(outcome.contract, {}),
      findings: parseJson(outcome.findings, []),
      proofCoverage: parseJson(outcome.proofCoverage, {}),
      validity: parseJson(outcome.validity, {}),
      nextActions: parseJson(outcome.nextActions, []),
    } : null,
    screenshots: screenshotRows.map((screenshot) => ({
      ...screenshot,
      createdAt: screenshot.createdAt?.toISOString?.() ?? null,
    })),
    recordings: recordingsForShare,
    consoleLogs: parseJson(run.consoleLogs, []).slice(-20).reverse(),
    networkErrors: parseJson(run.networkErrors, []).slice(-20).reverse(),
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CLI bridge — local-browser runs stream snapshots here so they appear in the
// dashboard narrated timeline alongside managed MCP runs.
// ──────────────────────────────────────────────────────────────────────────

// POST /v1/runs  → { runId }
runsRouter.post("/", async (req, res) => {
  const auth = await resolveUser(req);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { startUrl, viewportWidth, viewportHeight, userGoal, workflowName } = req.body ?? {};
  const runId = nanoid();
  await db.insert(runs).values({
    id: runId,
    userId: auth.userId,
    status: "active",
    executionMode: "cli-local",
    startUrl: typeof startUrl === "string" ? startUrl : null,
    viewportWidth: typeof viewportWidth === "number" ? viewportWidth : null,
    viewportHeight: typeof viewportHeight === "number" ? viewportHeight : null,
    startedAt: new Date(),
    updatedAt: new Date(),
  });
  // Stub a run_outcomes row so userGoal/workflowUsed can be filled later.
  await db.insert(runOutcomes).values({
    id: nanoid(),
    runId,
    userId: auth.userId,
    userGoal: typeof userGoal === "string" ? userGoal : null,
    workflowUsed: typeof workflowName === "string" ? workflowName : null,
    verdict: "inconclusive",
  }).catch(() => { /* best-effort */ });

  // Live update: a CLI-initiated run just appeared.
  emitDashboardEvent({
    type: "run.created",
    userId: auth.userId,
    runId,
    payload: {
      status: "active",
      executionMode: "cli-local",
      startUrl: typeof startUrl === "string" ? startUrl : null,
    },
  });

  res.json({ runId });
});

// POST /v1/runs/:id/steps  (multipart: png + JSON fields)
// Fields: toolName, prevUrl, nextUrl, pageTitle, heading, arg, arg2, agentNote
runsRouter.post("/:id/steps", async (req, res) => {
  const auth = await resolveUser(req);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const runId = req.params.id;
  const [run] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, auth.userId)));
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  // Accept either base64 JSON (simpler for CLI) or raw binary.
  const body = req.body ?? {};
  const png: string | undefined = body.pngBase64;
  if (!png || typeof png !== "string") {
    res.status(400).json({ error: "Missing pngBase64" });
    return;
  }
  const buffer = Buffer.from(png, "base64");
  const screenshotId = nanoid();
  const r2Key = `runs/${runId}/screenshots/${screenshotId}.png`;
  const publicUrl = await uploadScreenshot(r2Key, buffer, "image/png");

  const caption = deriveCaption({
    toolName: body.toolName ?? "cli:browser:action",
    prevUrl: body.prevUrl ?? null,
    nextUrl: body.nextUrl ?? null,
    prevTitle: body.prevTitle ?? null,
    nextTitle: body.pageTitle ?? null,
    prevHeading: body.prevHeading ?? null,
    nextHeading: body.heading ?? null,
    arg: body.arg ?? null,
    arg2: body.arg2 ?? null,
    agentNote: body.agentNote ?? null,
  });

  // Compute next step_index server-side (max + 1 within this run).
  const [{ maxStep }] = await db
    .select({ maxStep: sql<number>`COALESCE(MAX(${screenshots.stepIndex}), 0)` })
    .from(screenshots)
    .where(eq(screenshots.sessionId, runId));
  const stepIndex = (maxStep ?? 0) + 1;

  await db.insert(screenshots).values({
    id: screenshotId,
    userId: auth.userId,
    sessionId: runId,
    url: body.nextUrl ?? "",
    status: "done",
    r2Key,
    publicUrl,
    width: typeof body.width === "number" ? body.width : 1280,
    height: typeof body.height === "number" ? body.height : 800,
    fullPage: false,
    format: "png",
    delay: 0,
    stepIndex,
    actionLabel: caption.actionLabel,
    outcome: caption.outcome,
    toolName: body.toolName ?? "cli:browser:action",
    captionSource: caption.captionSource,
    agentNote: body.agentNote ?? null,
    prevUrl: body.prevUrl ?? null,
    pageTitle: body.pageTitle ?? null,
    heading: body.heading ?? null,
    completedAt: new Date(),
  });

  await db.update(runs)
    .set({ finalUrl: body.nextUrl ?? null, pageTitle: body.pageTitle ?? null, updatedAt: new Date() })
    .where(eq(runs.id, runId));

  // Live update: new step screenshot in a CLI run. Pushes into captures tab,
  // library list, dashboard overview — all without the client polling.
  emitDashboardEvent({
    type: "screenshot.completed",
    userId: auth.userId,
    runId,
    payload: {
      screenshotId,
      url: body.nextUrl ?? "",
      publicUrl,
      stepIndex,
      actionLabel: caption.actionLabel,
    },
  });
  emitDashboardEvent({
    type: "run.updated",
    userId: auth.userId,
    runId,
    payload: { finalUrl: body.nextUrl ?? null, pageTitle: body.pageTitle ?? null },
  });

  res.json({
    screenshotId,
    publicUrl,
    stepIndex,
    actionLabel: caption.actionLabel,
    outcome: caption.outcome,
  });
});

// PATCH /v1/runs/:id  → finish run
runsRouter.patch("/:id", async (req, res) => {
  const auth = await resolveUser(req);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const runId = req.params.id;
  const { status, finalUrl, pageTitle } = req.body ?? {};
  const nextStatus = status === "completed" || status === "failed" ? status : null;
  await db.update(runs)
    .set({
      ...(nextStatus ? { status: nextStatus, endedAt: new Date() } : {}),
      ...(typeof finalUrl === "string" ? { finalUrl } : {}),
      ...(typeof pageTitle === "string" ? { pageTitle } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(runs.id, runId), eq(runs.userId, auth.userId)));

  // Live update: run finished or status changed.
  emitDashboardEvent({
    type: nextStatus === "completed" || nextStatus === "failed" ? "run.completed" : "run.updated",
    userId: auth.userId,
    runId,
    payload: {
      status: nextStatus ?? "active",
      finalUrl: typeof finalUrl === "string" ? finalUrl : null,
      pageTitle: typeof pageTitle === "string" ? pageTitle : null,
    },
  });

  res.json({ ok: true });
});

// POST /v1/runs/:id/outcome  → write problem + summary + verdict + next actions
runsRouter.post("/:id/outcome", async (req, res) => {
  const auth = await resolveUser(req);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const runId = req.params.id;
  const { problem, summary, verdict, nextActions, findings, userGoal, taskType } = req.body ?? {};

  const [existing] = await db
    .select({ id: runOutcomes.id })
    .from(runOutcomes)
    .where(eq(runOutcomes.runId, runId));

  const patch = {
    ...(typeof problem === "string" ? { problem } : {}),
    ...(typeof summary === "string" ? { summary } : {}),
    ...(typeof verdict === "string" ? { verdict } : {}),
    ...(typeof userGoal === "string" ? { userGoal } : {}),
    ...(typeof taskType === "string" ? { taskType } : {}),
    ...(Array.isArray(nextActions) ? { nextActions: JSON.stringify(nextActions) } : {}),
    ...(Array.isArray(findings) ? { findings: JSON.stringify(findings) } : {}),
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(runOutcomes).set(patch).where(eq(runOutcomes.id, existing.id));
  } else {
    await db.insert(runOutcomes).values({
      id: nanoid(),
      runId,
      userId: auth.userId,
      verdict: typeof verdict === "string" ? verdict : "inconclusive",
      ...patch,
    });
  }

  // Live update: Summary tab, run detail header, and (soon) shared run pages
  // reflect verdict/summary/findings the moment the CLI or MCP writes them.
  emitDashboardEvent({
    type: "outcome.updated",
    userId: auth.userId,
    runId,
    payload: {
      verdict: typeof verdict === "string" ? verdict : undefined,
      hasSummary: typeof summary === "string" && summary.length > 0,
      findingsCount: Array.isArray(findings) ? findings.length : undefined,
      nextActionsCount: Array.isArray(nextActions) ? nextActions.length : undefined,
    },
  });

  res.json({ ok: true });
});

