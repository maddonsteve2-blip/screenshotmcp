import { and, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { apiKeys, users } from "@screenshotsmcp/db";
import { db } from "./db.js";

const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET || "").trim();

export type DashboardAuth = { userId: string };

/**
 * Resolves the authenticated user for dashboard / CLI / MCP callers.
 *
 * Accepts three credentials in priority order:
 *  1. `Authorization: Internal <secret>:<userId>` — server-to-server from the web app.
 *  2. `Authorization: Bearer user_<clerkId>` — direct Clerk-id auth from the dashboard.
 *  3. `x-api-key: sk_live_…` — public REST key for MCP/CLI/automation.
 *
 * Kept in a shared module so new dashboard-facing routes don't need to copy
 * the same 40-line helper and drift out of sync.
 */
export async function resolveDashboardUser(req: {
  headers: Record<string, string | string[] | undefined>;
}): Promise<DashboardAuth | null> {
  const authHeader = req.headers.authorization;
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;

  if (header?.startsWith("Internal ") && INTERNAL_SECRET) {
    const token = header.slice(9);
    const [secret, userId] = token.split(":");
    if (secret === INTERNAL_SECRET && userId) {
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (user) return { userId: user.id };
    }
  }

  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    if (token.startsWith("user_")) {
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, token));
      if (user) return { userId: user.id };
    }
  }

  const rawKey = req.headers["x-api-key"];
  const apiKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
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
