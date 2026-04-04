import { Response, NextFunction } from "express";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "../lib/db.js";
import { usageEvents } from "@screenshotsmcp/db";
import { PLAN_LIMITS } from "@screenshotsmcp/types";
import type { AuthRequest } from "./auth.js";

export async function enforcePlanLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const userId = req.userId!;
  const plan = (req.userPlan ?? "free") as "free" | "starter" | "pro";
  const limit = PLAN_LIMITS[plan].screenshotsPerMonth;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({ count: count() })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.createdAt, startOfMonth)
      )
    );

  const used = row?.count ?? 0;

  if (used >= limit) {
    res.status(429).json({
      error: "Monthly screenshot limit reached",
      used,
      limit,
      plan,
    });
    return;
  }

  next();
}
