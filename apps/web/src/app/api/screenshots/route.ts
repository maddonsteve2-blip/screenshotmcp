import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { screenshots } from "@screenshotsmcp/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ screenshots: [] });

  const rows = await db
    .select({
      id: screenshots.id,
      sessionId: screenshots.sessionId,
      url: screenshots.url,
      status: screenshots.status,
      publicUrl: screenshots.publicUrl,
      width: screenshots.width,
      height: screenshots.height,
      fullPage: screenshots.fullPage,
      format: screenshots.format,
      createdAt: screenshots.createdAt,
      completedAt: screenshots.completedAt,
    })
    .from(screenshots)
    .where(eq(screenshots.userId, user.id))
    .orderBy(desc(screenshots.createdAt))
    .limit(100);

  return NextResponse.json({ screenshots: rows });
}
