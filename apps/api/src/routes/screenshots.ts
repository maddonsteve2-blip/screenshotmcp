import { Router } from "express";
import { and, desc, eq, ilike, lt, or, sql, count } from "drizzle-orm";
import { db } from "../lib/db.js";
import { screenshots, runs } from "@deepsyte/db";
import { resolveDashboardUser } from "../lib/dashboard-auth.js";

export const screenshotsRouter = Router();

/**
 * GET /v1/screenshots — paginated library listing for the dashboard.
 *
 * Query params:
 *  - `q`        optional   free-text match against url + id
 *  - `status`   optional   `done` | `failed` | `pending` | `processing` — exact
 *                         match, or `attention` = anything not `done`
 *  - `artifact` optional   `linked` (has sessionId) | `pdf` | `full-page`
 *  - `before`   optional   ISO timestamp cursor. Returns rows with
 *                         createdAt < before. Omit for the first page.
 *  - `limit`    optional   default 50, max 100
 *  - `sessionId` optional  narrow to a specific run
 *
 * Response: `{ items, nextCursor, total }` where `nextCursor` is the
 * `createdAt` of the last returned row (ISO), or null if we've reached
 * the end. `total` is the count under the same filter (not the cursor),
 * so the UI can show "Showing N of TOTAL".
 */
screenshotsRouter.get("/", async (req, res) => {
  const auth = await resolveDashboardUser(req);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawLimit = Number.parseInt(String(req.query.limit ?? "50"), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const artifact = typeof req.query.artifact === "string" ? req.query.artifact.trim() : "";
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId.trim() : "";
  const beforeRaw = typeof req.query.before === "string" ? req.query.before.trim() : "";
  const before = beforeRaw ? new Date(beforeRaw) : null;

  const filters = [eq(screenshots.userId, auth.userId)];

  if (sessionId) filters.push(eq(screenshots.sessionId, sessionId));

  if (q) {
    const like = `%${q}%`;
    filters.push(
      // Match URL or capture id. ilike does case-insensitive compare.
      or(ilike(screenshots.url, like), ilike(screenshots.id, like))!,
    );
  }

  if (status === "done" || status === "failed" || status === "pending" || status === "processing") {
    filters.push(eq(screenshots.status, status));
  } else if (status === "attention") {
    filters.push(sql`${screenshots.status} <> 'done'`);
  }

  if (artifact === "linked") {
    filters.push(sql`${screenshots.sessionId} is not null`);
  } else if (artifact === "pdf") {
    filters.push(sql`${screenshots.publicUrl} ilike '%.pdf'`);
  } else if (artifact === "full-page") {
    filters.push(eq(screenshots.fullPage, true));
  }

  const whereForTotal = and(...filters);
  const whereForPage = before && !Number.isNaN(before.getTime())
    ? and(...filters, lt(screenshots.createdAt, before))
    : whereForTotal;

  const [rows, totalRows] = await Promise.all([
    db
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
      .where(whereForPage)
      .orderBy(desc(screenshots.createdAt))
      .limit(limit + 1),
    db.select({ value: count() }).from(screenshots).where(whereForTotal),
  ]);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].createdAt?.toISOString() ?? null : null;
  const total = Number(totalRows[0]?.value ?? 0);

  res.json({ items, nextCursor, total });
});
