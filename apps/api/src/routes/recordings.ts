import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../lib/db.js";
import { recordings, apiKeys, runs, users } from "@screenshotsmcp/db";
import { getPresignedUrl } from "../lib/r2.js";
import { createHash } from "crypto";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const recordingsRouter = Router();

// Auth middleware — accepts Bearer token or x-api-key header
async function resolveUser(req: any): Promise<{ userId: string } | null> {
  // Option 1: Bearer token (from dashboard via Clerk)
  const authHeader = req.headers.authorization;
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
  }

  // Option 2: API key (sk_live_...)
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

// GET /recordings — list user's recordings with signed URLs
recordingsRouter.get("/", async (req, res) => {
  const auth = await resolveUser(req);
  if (!auth) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessionId = typeof req.query.sessionId === "string" && req.query.sessionId.trim()
    ? req.query.sessionId.trim()
    : null;

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
    .where(sessionId
      ? and(eq(recordings.userId, auth.userId), eq(recordings.sessionId, sessionId))
      : eq(recordings.userId, auth.userId))
    .orderBy(desc(recordings.createdAt))
    .limit(50);

  const items = await Promise.all(
    rows.map(async (r) => ({
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

  res.json({ recordings: items });
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
  res.json({ success: true });
});
