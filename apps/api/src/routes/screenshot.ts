import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { screenshots, usageEvents } from "@screenshotsmcp/db";
import { screenshotQueue } from "../lib/queue.js";
import { uploadScreenshot } from "../lib/r2.js";
import { requireApiKey, type AuthRequest } from "../middleware/auth.js";
import { enforcePlanLimit } from "../middleware/rateLimit.js";
import { idempotency } from "../middleware/idempotency.js";
import { performScreenshotDiff } from "../lib/screenshot-diff.js";

export const screenshotRouter = Router();

const createSchema = z.object({
  url: z.string().url(),
  width: z.number().int().min(320).max(3840).optional().default(1280),
  height: z.number().int().min(240).max(2160).optional().default(800),
  fullPage: z.boolean().optional().default(false),
  format: z.enum(["png", "jpeg", "webp"]).optional().default("png"),
  delay: z.number().int().min(0).max(10000).optional().default(0),
  pdf: z.boolean().optional().default(false),
  darkMode: z.boolean().optional().default(false),
});

const uploadSchema = z.object({
  dataUrl: z.string().min(1),
  url: z.string().optional().default(""),
  title: z.string().optional().default(""),
  width: z.number().int().min(1).max(20000).optional().default(1280),
  height: z.number().int().min(1).max(20000).optional().default(800),
  fullPage: z.boolean().optional().default(false),
});

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; extension: "png" | "jpeg" | "webp" } {
  const match = dataUrl.match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/);

  if (!match) {
    throw new Error("Invalid image payload");
  }

  const contentType = match[1];
  const extension = match[2] as "png" | "jpeg" | "webp";
  const buffer = Buffer.from(match[3], "base64");

  return { buffer, contentType, extension };
}

screenshotRouter.post(
  "/",
  requireApiKey,
  enforcePlanLimit,
  idempotency("v1.screenshot.create"),
  async (req: AuthRequest, res, next) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const sync = req.query.sync === "true" || req.query.sync === "1";
      const id = nanoid();
      const { url, width, height, fullPage, format, delay } = parsed.data;

      await db.insert(screenshots).values({
        id,
        userId: req.userId!,
        url,
        status: "pending",
        width,
        height,
        fullPage,
        format,
        delay,
      });

      await db.insert(usageEvents).values({
        id: nanoid(),
        userId: req.userId!,
        screenshotId: id,
      });

      await screenshotQueue.add(
        "capture",
        { id, userId: req.userId!, options: parsed.data },
        { jobId: id, attempts: 2, backoff: { type: "exponential", delay: 2000 } }
      );

      if (!sync) {
        res.status(202).json({ id, status: "pending" });
        return;
      }

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const [row] = await db.select().from(screenshots).where(eq(screenshots.id, id));
        if (row?.status === "done") {
          res.json({ id, status: "done", url: row.publicUrl });
          return;
        }
        if (row?.status === "failed") {
          res.status(500).json({ id, status: "failed", error: row.errorMessage });
          return;
        }
      }
      res.status(408).json({ id, status: "timeout", error: "Screenshot timed out after 60s" });
    } catch (err) {
      next(err);
    }
  }
);

screenshotRouter.post(
  "/upload",
  requireApiKey,
  enforcePlanLimit,
  idempotency("v1.screenshot.upload"),
  async (req: AuthRequest, res, next) => {
    try {
      const parsed = uploadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const { buffer, contentType, extension } = parseDataUrl(parsed.data.dataUrl);
      const id = nanoid();
      const r2Key = `screenshots/${id}.${extension}`;
      const publicUrl = await uploadScreenshot(r2Key, buffer, contentType);

      await db.insert(screenshots).values({
        id,
        userId: req.userId!,
        url: parsed.data.url || parsed.data.title || `extension://${id}`,
        status: "done",
        r2Key,
        publicUrl,
        width: parsed.data.width,
        height: parsed.data.height,
        fullPage: parsed.data.fullPage,
        format: extension,
        delay: 0,
        completedAt: new Date(),
      });

      await db.insert(usageEvents).values({
        id: nanoid(),
        userId: req.userId!,
        screenshotId: id,
      });

      res.json({ id, status: "done", url: publicUrl });
    } catch (err) {
      next(err);
    }
  }
);

const diffSchema = z.object({
  urlA: z.string().url(),
  urlB: z.string().url(),
  width: z.number().int().min(320).max(3840).optional().default(1280),
  height: z.number().int().min(240).max(2160).optional().default(800),
  threshold: z.number().min(0).max(1).optional().default(0.1),
});

/**
 * Synchronous visual diff. Used by the `screenshotsmcp/action` GitHub Action
 * and any CI pipeline that wants a baseline-vs-head comparison without
 * driving the MCP transport directly. Counts as one screenshot against the
 * monthly quota (the underlying captures share the request).
 */
screenshotRouter.post(
  "/diff",
  requireApiKey,
  enforcePlanLimit,
  idempotency("v1.screenshot.diff"),
  async (req: AuthRequest, res, next) => {
    try {
      const parsed = diffSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const result = await performScreenshotDiff(parsed.data);
      await db
        .insert(usageEvents)
        .values({ id: nanoid(), userId: req.userId!, screenshotId: null });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

screenshotRouter.get(
  "/:id",
  requireApiKey,
  async (req: AuthRequest, res, next) => {
    try {
      const [row] = await db
        .select()
        .from(screenshots)
        .where(eq(screenshots.id, req.params.id as string));

      if (!row || row.userId !== req.userId) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.json({
        id: row.id,
        status: row.status,
        url: row.publicUrl ?? null,
        error: row.errorMessage ?? null,
        createdAt: row.createdAt,
      });
    } catch (err) {
      next(err);
    }
  }
);
