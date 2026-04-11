import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { recordings } from "@screenshotsmcp/db";
import { deleteR2Object } from "@/lib/r2";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { id } = await params;
  const db = getDb();

  // Find the recording (ensure it belongs to the user)
  const [recording] = await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.id, id), eq(recordings.userId, user.id)));

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  // Delete from R2
  await deleteR2Object(recording.r2Key).catch((err) =>
    console.error("Failed to delete R2 object:", err)
  );

  // Delete from DB
  await db.delete(recordings).where(eq(recordings.id, id));

  return NextResponse.json({ success: true });
}
