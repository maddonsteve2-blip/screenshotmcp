import { Response, NextFunction } from "express";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "../lib/db.js";
import { usageEvents, users } from "@deepsyte/db";
import { PLAN_LIMITS, LEGACY_FREE_QUOTA_PER_MONTH } from "@deepsyte/types";
import type { AuthRequest } from "./auth.js";
import type { RequestIdRequest } from "./requestId.js";
import { emitWebhookEvent } from "../lib/webhook-delivery.js";
import { emitActivation } from "../lib/activation.js";
import { getRedis } from "../lib/redis.js";

const QUOTA_WARNING_THRESHOLDS = [0.8, 0.95] as const;

/**
 * Emit `quota.warning` at 80% and 95% of the monthly cap, at most once per
 * threshold per user per month. Uses Redis SETNX with a TTL aligned to the
 * window reset so the next month is clean.
 */
async function maybeEmitQuotaWarning(
  userId: string,
  plan: string,
  used: number,
  limit: number,
  resetSeconds: number,
): Promise<void> {
  if (limit <= 0) return;
  const ratio = used / limit;
  const redis = getRedis();
  for (const threshold of QUOTA_WARNING_THRESHOLDS) {
    if (ratio < threshold) continue;
    const key = `quota-warning:${userId}:${threshold}:${resetSeconds}`;
    let firstFire = true;
    if (redis) {
      try {
        const ttl = Math.max(60, resetSeconds - Math.floor(Date.now() / 1000));
        const set = await redis.set(key, "1", "EX", ttl, "NX");
        firstFire = set === "OK";
      } catch {
        firstFire = false; // be conservative if Redis hiccups
      }
    }
    if (!firstFire) continue;
    const payload = {
      threshold,
      used,
      limit,
      plan,
      remaining: Math.max(0, limit - used),
      resetAt: new Date(resetSeconds * 1000).toISOString(),
    };
    void emitWebhookEvent({
      userId,
      eventType: "quota.warning",
      dedupeKey: key,
      payload,
    }).catch(() => {});
    void emitActivation(
      threshold === 0.95 ? "quota_warning_95" : "quota_warning_80",
      { userId, properties: payload },
    );
  }
}

/**
 * Resolve the cutover date that separates grandfathered free users from
 * new signups. Parsed once per import; invalid values mean "no cutover"
 * so behavior matches the published `PLAN_LIMITS.free` for everyone.
 */
const FREE_QUOTA_CUTOVER_MS = (() => {
  const raw = process.env.FREE_QUOTA_CUTOVER_DATE;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
})();

/**
 * Plan quota check. Adds standard rate-limit response headers on every call
 * (not just 429s), so well-behaved clients can watch their own budget:
 *
 *   X-RateLimit-Limit      — monthly cap for this plan
 *   X-RateLimit-Remaining  — cap - usage, clamped at 0
 *   X-RateLimit-Reset      — unix seconds when the window resets (first of next month)
 *   Retry-After            — on 429 only, seconds until reset
 */
export async function enforcePlanLimit(
  req: AuthRequest & RequestIdRequest,
  res: Response,
  next: NextFunction,
) {
  const userId = req.userId!;
  const plan = (req.userPlan ?? "free") as "free" | "starter" | "pro";
  let limit = PLAN_LIMITS[plan].screenshotsPerMonth;
  let grandfathered = false;

  // Grandfather free users who signed up before the canonical-quota cutover
  // so the 100/mo launch does not retroactively break them.
  if (plan === "free" && FREE_QUOTA_CUTOVER_MS !== null) {
    const [userRow] = await db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId));
    if (userRow?.createdAt && userRow.createdAt.getTime() < FREE_QUOTA_CUTOVER_MS) {
      limit = LEGACY_FREE_QUOTA_PER_MONTH;
      grandfathered = true;
    }
  }

  const now = new Date();
  const startOfMonth = new Date(now);
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const startOfNextMonth = new Date(startOfMonth);
  startOfNextMonth.setMonth(startOfNextMonth.getMonth() + 1);
  const resetSeconds = Math.floor(startOfNextMonth.getTime() / 1000);

  const [row] = await db
    .select({ count: count() })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.createdAt, startOfMonth),
      ),
    );

  const used = row?.count ?? 0;
  const remaining = Math.max(0, limit - used);

  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset", String(resetSeconds));
  if (grandfathered) res.setHeader("X-RateLimit-Policy", "legacy-free-grandfathered");

  void maybeEmitQuotaWarning(userId, plan, used, limit, resetSeconds);

  if (used >= limit) {
    const retryAfter = Math.max(1, resetSeconds - Math.floor(now.getTime() / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      error: "Monthly screenshot limit reached",
      code: "PLAN_QUOTA_EXCEEDED",
      requestId: req.requestId,
      details: { used, limit, plan, resetAt: startOfNextMonth.toISOString() },
    });
    return;
  }

  next();
}
