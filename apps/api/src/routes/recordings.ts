import { Router } from "express";
import { eq, and, desc, or, ilike, lt, count } from "drizzle-orm";
import { db } from "../lib/db.js";
import { recordings, runs, users } from "@deepsyte/db";
import { getPresignedUrl } from "../lib/r2.js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { emitDashboardEvent } from "../lib/dashboard-events.js";
import { validateApiOrOAuthToken } from "../lib/auth-tokens.js";

export const recordingsRouter = Router();
const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET || "").trim();

// Auth middleware — accepts Bearer token or x-api-key header
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

  // Option 1: Bearer token (from dashboard via Clerk)
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Clerk user ID passed directly from dashboard
    if (token.startsWith("user_")) {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, token));
      if (user) return { userId: user.id };
    }

    const auth = await validateApiOrOAuthToken(token);
    if (auth) return { userId: auth.userId };
  }

  // Option 2: API key or website-issued MCP OAuth token
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (apiKey) {
    const auth = await validateApiOrOAuthToken(apiKey);
    if (auth) return { userId: auth.userId };
  }

  return null;
}

// GET /recordings — paginated library listing with search.
//
// Query params:
//   q          free-text match on pageUrl + recording id
//   sessionId  narrow to a specific run
//   before     ISO cursor — rows with createdAt < before
//   limit      default 30, max 100
// Response: { items, nextCursor, total }
recordingsRouter.get("/", async (req, res) => {
  const auth = await resolveUser(req);
  if (!auth) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessionId = typeof req.query.sessionId === "string" && req.query.sessionId.trim()
    ? req.query.sessionId.trim()
    : null;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const rawLimit = Number.parseInt(String(req.query.limit ?? "30"), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;
  const beforeRaw = typeof req.query.before === "string" ? req.query.before.trim() : "";
  const before = beforeRaw ? new Date(beforeRaw) : null;

  const filters = [eq(recordings.userId, auth.userId)];
  if (sessionId) filters.push(eq(recordings.sessionId, sessionId));
  if (q) {
    const like = `%${q}%`;
    filters.push(or(ilike(recordings.pageUrl, like), ilike(recordings.id, like))!);
  }

  const whereForTotal = and(...filters);
  const whereForPage = before && !Number.isNaN(before.getTime())
    ? and(...filters, lt(recordings.createdAt, before))
    : whereForTotal;

  const [rows, totalRows] = await Promise.all([
    db
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
      .where(whereForPage)
      .orderBy(desc(recordings.createdAt))
      .limit(limit + 1),
    db.select({ value: count() }).from(recordings).where(whereForTotal),
  ]);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const items = await Promise.all(
    pageRows.map(async (r) => ({
      id: r.id,
      sessionId: r.sessionId,
      pageUrl: r.pageUrl,
      fileSize: r.fileSize,
      durationMs: r.durationMs,
      viewportWidth: r.viewportWidth,
      viewportHeight: r.viewportHeight,
      createdAt: r.createdAt,
      shareToken: r.shareToken,
      sharedAt: r.sharedAt,
      videoUrl: await getPresignedUrl(r.r2Key, 3600),
    }))
  );

  const nextCursor = hasMore ? items[items.length - 1].createdAt?.toISOString() ?? null : null;
  const total = Number(totalRows[0]?.value ?? 0);

  res.json({ items, nextCursor, total });
});

// DELETE /recordings/:id — delete a specific recording
recordingsRouter.delete("/:id", async (req, res) => {
  const auth = await resolveUser(req);
  if (!auth) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [recording] = await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.id, req.params.id), eq(recordings.userId, auth.userId)));

  if (!recording) { res.status(404).json({ error: "Recording not found" }); return; }

  // Delete from R2
  try {
    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: recording.r2Key }));
  } catch (err) {
    console.error("Failed to delete R2 object:", err);
  }

  await db.delete(recordings).where(eq(recordings.id, req.params.id));

  // Live update: library and run detail strip this recording without a reload.
  emitDashboardEvent({
    type: "recording.deleted",
    userId: auth.userId,
    runId: recording.sessionId ?? undefined,
    payload: { recordingId: recording.id },
  });

  res.json({ success: true });
});
