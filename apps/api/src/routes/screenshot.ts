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
  pdf: z.boolean().optional().default(false),
  darkMode: z.boolean().optional().default(false),
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
