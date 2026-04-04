import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { apiKeys, users } from "@screenshotsmcp/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId));
  if (!user) return NextResponse.json({ keys: [] });

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
    .where(eq(apiKeys.userId, user.id));

  return NextResponse.json({ keys: rows });
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId));
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const rawKey = `sk_live_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPreview = `${rawKey.slice(0, 12)}...${rawKey.slice(-4)}`;
  const id = nanoid();

  await db.insert(apiKeys).values({
    id,
    userId: user.id,
    name: name.trim(),
    keyHash,
    keyPreview,
  });

  return NextResponse.json({ key: rawKey, id });
}
