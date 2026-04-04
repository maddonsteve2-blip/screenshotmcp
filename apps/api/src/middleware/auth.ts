import { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db.js";
import { apiKeys, users } from "@screenshotsmcp/db";

export interface AuthRequest extends Request {
  userId?: string;
  userPlan?: string;
}

export async function requireApiKey(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }

  const rawKey = authHeader.slice(7);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const [keyRow] = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      revoked: apiKeys.revoked,
      plan: users.plan,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.revoked, false)));

  if (!keyRow) {
    res.status(401).json({ error: "Invalid or revoked API key" });
    return;
  }

  await db
    .update(apiKeys)
    .set({ lastUsed: new Date() })
    .where(eq(apiKeys.id, keyRow.id));

  req.userId = keyRow.userId;
  req.userPlan = keyRow.plan;
  next();
}
