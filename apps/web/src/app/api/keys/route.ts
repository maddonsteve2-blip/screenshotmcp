import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { decryptApiKey, encryptApiKey } from "@/lib/api-key-crypto";
import { apiKeys } from "@screenshotsmcp/db";

// GET: return the user's single active key (or null)
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ key: null });

  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPreview: apiKeys.keyPreview,
      lastUsed: apiKeys.lastUsed,
      createdAt: apiKeys.createdAt,
      revoked: apiKeys.revoked,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, user.id), eq(apiKeys.revoked, false)));

  const active = rows[0] ?? null;
  return NextResponse.json({ key: active });
}

// POST: create or get-or-create the user's single key.
// If they already have an active key, return its preview (not raw — that's only shown once).
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let requestName = "Default";
  let revealExisting = false;

  try {
    const body = (await req.json()) as { name?: string; revealExisting?: boolean };
    if (body?.name?.trim()) {
      requestName = body.name.trim();
    }
    revealExisting = Boolean(body?.revealExisting);
  } catch {
    // No JSON body provided; use defaults.
  }

  // Check for existing active key
  const existing = await db
    .select({ id: apiKeys.id, keyPreview: apiKeys.keyPreview, encryptedKey: apiKeys.encryptedKey })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, user.id), eq(apiKeys.revoked, false)));

  if (existing.length > 0) {
    const revealedKey = revealExisting ? decryptApiKey(existing[0].encryptedKey) : null;
    return NextResponse.json({
      key: revealedKey,
      id: existing[0].id,
      existing: true,
      keyPreview: existing[0].keyPreview,
      reusable: Boolean(revealedKey),
      requiresRotation: revealExisting && !revealedKey,
    });
  }

  const rawKey = `sk_live_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPreview = `${rawKey.slice(0, 12)}...${rawKey.slice(-4)}`;
  const id = nanoid();

  await db.insert(apiKeys).values({
    id,
    userId: user.id,
    name: requestName,
    keyHash,
    keyPreview,
    encryptedKey: encryptApiKey(rawKey),
  });

  return NextResponse.json({ key: rawKey, id, existing: false, reusable: true, requiresRotation: false });
}

// PUT: roll/regenerate the key — revoke old, create new, return raw key once
export async function PUT() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Revoke all existing keys
  await db
    .update(apiKeys)
    .set({ revoked: true })
    .where(and(eq(apiKeys.userId, user.id), eq(apiKeys.revoked, false)));

  // Create fresh key
  const rawKey = `sk_live_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPreview = `${rawKey.slice(0, 12)}...${rawKey.slice(-4)}`;
  const id = nanoid();

  await db.insert(apiKeys).values({
    id,
    userId: user.id,
    name: "Default",
    keyHash,
    keyPreview,
    encryptedKey: encryptApiKey(rawKey),
  });

  return NextResponse.json({ key: rawKey, id });
}
