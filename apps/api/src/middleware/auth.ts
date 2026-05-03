import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { users } from "@deepsyte/db";
import { validateApiOrOAuthToken } from "../lib/auth-tokens.js";

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

  // Standard Bearer auth. Raw API keys remain valid for public REST API use;
  // website-issued dso_ OAuth tokens are required by MCP/CLI-only paths.
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }

  const auth = await validateApiOrOAuthToken(authHeader.slice(7));
  if (!auth) {
    res.status(401).json({ error: "Invalid, revoked, or expired credential" });
    return;
  }

  req.userId = auth.userId;
  req.userPlan = auth.plan;
  next();
}
