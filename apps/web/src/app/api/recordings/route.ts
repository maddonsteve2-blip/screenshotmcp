import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { recordings } from "@screenshotsmcp/db";
import { getPresignedUrl } from "@/lib/r2";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const db = getDb();
  const rows = await db
    .select()
    .from(recordings)
    .where(eq(recordings.userId, user.id))
    .orderBy(desc(recordings.createdAt))
    .limit(50);

  // Generate signed URLs for each recording
  const items = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      sessionId: r.sessionId,
      pageUrl: r.pageUrl,
      fileSize: r.fileSize,
      durationMs: r.durationMs,
      viewportWidth: r.viewportWidth,
      viewportHeight: r.viewportHeight,
      createdAt: r.createdAt,
      videoUrl: await getPresignedUrl(r.r2Key, 3600),
    }))
  );

  return NextResponse.json({ recordings: items });
}
