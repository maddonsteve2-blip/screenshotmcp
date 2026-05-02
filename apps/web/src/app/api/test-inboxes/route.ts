import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { testInboxes } from "@deepsyte/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const db = getDb();
  const inboxes = await db
    .select()
    .from(testInboxes)
    .where(and(eq(testInboxes.userId, user.id), eq(testInboxes.isActive, true)))
    .orderBy(desc(testInboxes.lastUsedAt), desc(testInboxes.createdAt));

  return NextResponse.json({ inboxes });
}

export async function DELETE(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const inboxId = searchParams.get("id");
  if (!inboxId) return NextResponse.json({ error: "Missing inbox id" }, { status: 400 });

  const db = getDb();
  await db
    .update(testInboxes)
    .set({ isActive: false })
    .where(and(eq(testInboxes.id, inboxId), eq(testInboxes.userId, user.id)));

  return NextResponse.json({ success: true });
}
