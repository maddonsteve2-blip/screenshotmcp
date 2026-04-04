import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { apiKeys } from "@screenshotsmcp/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(apiKeys)
    .set({ revoked: true })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)));

  return NextResponse.json({ ok: true });
}
