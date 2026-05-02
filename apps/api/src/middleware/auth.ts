import { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db.js";
import { apiKeys, users } from "@deepsyte/db";

export interface AuthRequest extends Request {
  userId?: string;
  userPlan?: string;
  /**
   * Forward-compatible org scope. Read from `X-Organization-ID` header when
   * present so future multi-org auth can become additive without breaking
   * existing single-user API keys. Today this is advisory only — no route
   * enforces it. When orgs land, `requireApiKey` will resolve the caller's
   * default org automatically and `requireScope()` will gate sensitive paths.
   */
  organizationId?: string | null;
}

const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET || "").trim();
const ORG_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

function readOrganizationHeader(req: AuthRequest): string | null {
  const raw = req.headers["x-organization-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const trimmed = value.trim();
  return ORG_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export async function requireApiKey(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  req.organizationId = readOrganizationHeader(req);

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }

  // Internal auth from web server (playground proxy)
  if (authHeader.startsWith("Internal ") && INTERNAL_SECRET) {
    const token = authHeader.slice(9);
    const [secret, userId] = token.split(":");
    if (secret === INTERNAL_SECRET && userId) {
      const [user] = await db.select({ id: users.id, plan: users.plan }).from(users).where(eq(users.id, userId));
      if (user) {
        req.userId = user.id;
        req.userPlan = user.plan;
        return next();
      }
    }
    res.status(401).json({ error: "Invalid internal auth" });
    return;
  }

  // Standard Bearer API key auth
  if (!authHeader.startsWith("Bearer ")) {
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
