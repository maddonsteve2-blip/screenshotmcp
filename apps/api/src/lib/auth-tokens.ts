import { createHash, randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { apiKeys, mcpOauthTokens, users } from "@deepsyte/db";
import { db } from "./db.js";

export type AuthenticatedUser = {
  userId: string;
  plan: "free" | "starter" | "pro";
  agentmailApiKey?: string | null;
  authMethod: "api-key" | "mcp-oauth";
};

const MCP_OAUTH_TOKEN_PREFIX = "dso_";
const DEFAULT_MCP_OAUTH_TOKEN_TTL_HOURS = 24;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getMcpOAuthTokenTtlHours(): number {
  const raw = Number.parseInt(process.env.MCP_OAUTH_TOKEN_TTL_HOURS ?? "", 10);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }

  return DEFAULT_MCP_OAUTH_TOKEN_TTL_HOURS;
}

export function isMcpOAuthToken(token: string): boolean {
  return token.startsWith(MCP_OAUTH_TOKEN_PREFIX);
}

export async function issueMcpOAuthToken(userId: string, clientId = "mcp-client"): Promise<{
  accessToken: string;
  expiresAt: Date;
  expiresIn: number;
}> {
  const accessToken = `${MCP_OAUTH_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const expiresIn = getMcpOAuthTokenTtlHours() * 60 * 60;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await db.insert(mcpOauthTokens).values({
    id: randomBytes(16).toString("base64url"),
    userId,
    tokenHash: sha256(accessToken),
    clientId,
    scope: "mcp:tools",
    expiresAt,
  });

  return { accessToken, expiresAt, expiresIn };
}

export async function validateMcpOAuthToken(token: string): Promise<AuthenticatedUser | null> {
  if (!isMcpOAuthToken(token)) {
    return null;
  }

  const [row] = await db
    .select({
      tokenId: mcpOauthTokens.id,
      expiresAt: mcpOauthTokens.expiresAt,
      userId: mcpOauthTokens.userId,
      plan: users.plan,
      agentmailApiKey: users.agentmailApiKey,
    })
    .from(mcpOauthTokens)
    .innerJoin(users, eq(mcpOauthTokens.userId, users.id))
    .where(and(eq(mcpOauthTokens.tokenHash, sha256(token)), isNull(mcpOauthTokens.revokedAt)));

  const expiresAt = row ? new Date(row.expiresAt) : null;
  if (!row || !expiresAt || expiresAt.getTime() <= Date.now()) {
    return null;
  }

  await db.update(mcpOauthTokens).set({ lastUsed: new Date() }).where(eq(mcpOauthTokens.id, row.tokenId));

  return {
    userId: row.userId,
    plan: (row.plan ?? "free") as "free" | "starter" | "pro",
    agentmailApiKey: row.agentmailApiKey,
    authMethod: "mcp-oauth",
  };
}

export async function validateApiKey(rawKey: string): Promise<AuthenticatedUser | null> {
  if (!rawKey.startsWith("sk_live_")) {
    return null;
  }

  const [row] = await db
    .select({
      keyId: apiKeys.id,
      userId: apiKeys.userId,
      plan: users.plan,
      agentmailApiKey: users.agentmailApiKey,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, sha256(rawKey)), eq(apiKeys.revoked, false)));

  if (!row) {
    return null;
  }

  await db.update(apiKeys).set({ lastUsed: new Date() }).where(eq(apiKeys.id, row.keyId));

  return {
    userId: row.userId,
    plan: (row.plan ?? "free") as "free" | "starter" | "pro",
    agentmailApiKey: row.agentmailApiKey,
    authMethod: "api-key",
  };
}

export async function validateApiOrOAuthToken(token: string): Promise<AuthenticatedUser | null> {
  if (isMcpOAuthToken(token)) {
    return validateMcpOAuthToken(token);
  }

  return validateApiKey(token);
}
