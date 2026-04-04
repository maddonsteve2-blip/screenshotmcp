import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { screenshots, usageEvents } from "@screenshotsmcp/db";
import { screenshotQueue } from "../lib/queue.js";
import { requireApiKey, type AuthRequest } from "../middleware/auth.js";
import { enforcePlanLimit } from "../middleware/rateLimit.js";

export const screenshotRouter = Router();

const createSchema = z.object({
  url: z.string().url(),
  width: z.number().int().min(320).max(3840).optional().default(1280),
  height: z.number().int().min(240).max(2160).optional().default(800),
  fullPage: z.boolean().optional().default(false),
  format: z.enum(["png", "jpeg", "webp"]).optional().default("png"),
  delay: z.number().int().min(0).max(10000).optional().default(0),
});

screenshotRouter.post(
  "/",
  requireApiKey,
  enforcePlanLimit,
  async (req: AuthRequest, res, next) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

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

      res.status(202).json({ id, status: "pending" });
    } catch (err) {
      next(err);
    }
  }
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
