import { auth } from "@clerk/nextjs/server";
import { eq, count, and, gte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { usageEvents, apiKeys, screenshots, recordings } from "@screenshotsmcp/db";
import { PLAN_LIMITS } from "@screenshotsmcp/types";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  const db = getDb();
  const user = await getOrCreateDbUser(clerkId!);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [usageRows, keyRows, recordingRows, recentScreenshotRows, recentRecordingRows] = user
    ? await Promise.all([
        db.select({ count: count() }).from(usageEvents).where(and(eq(usageEvents.userId, user.id), gte(usageEvents.createdAt, startOfMonth))),
        db.select({ count: count() }).from(apiKeys).where(and(eq(apiKeys.userId, user.id), eq(apiKeys.revoked, false))),
        db.select({ count: count() }).from(recordings).where(and(eq(recordings.userId, user.id), gte(recordings.createdAt, startOfMonth))),
        db
          .select({
            id: screenshots.id,
            url: screenshots.url,
            status: screenshots.status,
            publicUrl: screenshots.publicUrl,
            width: screenshots.width,
            height: screenshots.height,
            format: screenshots.format,
            fullPage: screenshots.fullPage,
            createdAt: screenshots.createdAt,
          })
          .from(screenshots)
          .where(eq(screenshots.userId, user.id))
          .orderBy(desc(screenshots.createdAt))
          .limit(5),
        db
          .select({
            id: recordings.id,
            pageUrl: recordings.pageUrl,
            durationMs: recordings.durationMs,
            viewportWidth: recordings.viewportWidth,
            viewportHeight: recordings.viewportHeight,
            createdAt: recordings.createdAt,
          })
          .from(recordings)
          .where(eq(recordings.userId, user.id))
          .orderBy(desc(recordings.createdAt))
          .limit(5),
      ])
    : [[{ count: 0 }], [{ count: 0 }], [{ count: 0 }], [], []];

  const plan = (user?.plan ?? "free") as "free" | "starter" | "pro";
  const limit = PLAN_LIMITS[plan].screenshotsPerMonth;
  const used = usageRows[0]?.count ?? 0;
  const keyCount = keyRows[0]?.count ?? 0;
  const recordingCount = recordingRows[0]?.count ?? 0;

  return (
    <DashboardClient 
      data={{
        usage: used,
        limit,
        keyCount,
        recordingCount,
        plan,
        apiUrl: process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app",
        recentScreenshots: recentScreenshotRows.map((item) => ({
          ...item,
          createdAt: item.createdAt?.toISOString() ?? new Date().toISOString(),
        })),
        recentRecordings: recentRecordingRows.map((item) => ({
          ...item,
          createdAt: item.createdAt?.toISOString() ?? new Date().toISOString(),
        })),
      }}
    />
  );
}
