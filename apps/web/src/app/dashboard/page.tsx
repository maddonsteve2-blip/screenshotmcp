import { auth } from "@clerk/nextjs/server";
import { eq, count, and, gte, desc, gt, inArray, isNotNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { usageEvents, apiKeys, screenshots, recordings, runs } from "@screenshotsmcp/db";
import { PLAN_LIMITS } from "@screenshotsmcp/types";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  const db = getDb();
  const user = await getOrCreateDbUser(clerkId!);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [usageRows, keyRows, recordingRows, recentScreenshotRows, recentRecordingRows, recentRunRows, activeRunRows, failedRunRows, issueRunRows, sharedRunRows] = user
    ? await Promise.all([
        db.select({ count: count() }).from(usageEvents).where(and(eq(usageEvents.userId, user.id), gte(usageEvents.createdAt, startOfMonth))),
        db.select({ count: count() }).from(apiKeys).where(and(eq(apiKeys.userId, user.id), eq(apiKeys.revoked, false))),
        db.select({ count: count() }).from(recordings).where(and(eq(recordings.userId, user.id), gte(recordings.createdAt, startOfMonth))),
        db
          .select({
            id: screenshots.id,
            url: screenshots.url,
            status: screenshots.status,
            sessionId: screenshots.sessionId,
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
            sessionId: recordings.sessionId,
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
        db
          .select({
            id: runs.id,
            status: runs.status,
            executionMode: runs.executionMode,
            startUrl: runs.startUrl,
            finalUrl: runs.finalUrl,
            pageTitle: runs.pageTitle,
            shareToken: runs.shareToken,
            sharedAt: runs.sharedAt,
            viewportWidth: runs.viewportWidth,
            viewportHeight: runs.viewportHeight,
            consoleErrorCount: runs.consoleErrorCount,
            consoleWarningCount: runs.consoleWarningCount,
            networkErrorCount: runs.networkErrorCount,
            startedAt: runs.startedAt,
            endedAt: runs.endedAt,
          })
          .from(runs)
          .where(eq(runs.userId, user.id))
          .orderBy(desc(runs.startedAt), desc(runs.createdAt))
          .limit(5),
        db.select({ count: count() }).from(runs).where(and(eq(runs.userId, user.id), eq(runs.status, "active"))),
        db.select({ count: count() }).from(runs).where(and(eq(runs.userId, user.id), eq(runs.status, "failed"))),
        db.select({ count: count() }).from(runs).where(and(eq(runs.userId, user.id), or(gt(runs.consoleErrorCount, 0), gt(runs.networkErrorCount, 0)))),
        db.select({ count: count() }).from(runs).where(and(eq(runs.userId, user.id), isNotNull(runs.sharedAt))),
      ])
    : [[{ count: 0 }], [{ count: 0 }], [{ count: 0 }], [], [], [], [{ count: 0 }], [{ count: 0 }], [{ count: 0 }], [{ count: 0 }]];

  const recentRunIds = recentRunRows.map((run) => run.id);

  const [recentRunScreenshotCounts, recentRunRecordingCounts] = user && recentRunIds.length > 0
    ? await Promise.all([
        db
          .select({ sessionId: screenshots.sessionId, count: count() })
          .from(screenshots)
          .where(and(eq(screenshots.userId, user.id), inArray(screenshots.sessionId, recentRunIds)))
          .groupBy(screenshots.sessionId),
        db
          .select({ sessionId: recordings.sessionId, count: count() })
          .from(recordings)
          .where(and(eq(recordings.userId, user.id), inArray(recordings.sessionId, recentRunIds)))
          .groupBy(recordings.sessionId),
      ])
    : [[], []];

  const screenshotCountBySession = new Map(
    recentRunScreenshotCounts
      .filter((row) => !!row.sessionId)
      .map((row) => [row.sessionId as string, row.count]),
  );

  const recordingCountBySession = new Map(
    recentRunRecordingCounts.map((row) => [row.sessionId, row.count]),
  );

  const plan = (user?.plan ?? "free") as "free" | "starter" | "pro";
  const limit = PLAN_LIMITS[plan].screenshotsPerMonth;
  const used = usageRows[0]?.count ?? 0;
  const keyCount = keyRows[0]?.count ?? 0;
  const recordingCount = recordingRows[0]?.count ?? 0;
  const activeRunCount = activeRunRows[0]?.count ?? 0;
  const failedRunCount = failedRunRows[0]?.count ?? 0;
  const issueRunCount = issueRunRows[0]?.count ?? 0;
  const sharedRunCount = sharedRunRows[0]?.count ?? 0;

  return (
    <DashboardClient
      data={{
        usage: used,
        limit,
        keyCount,
        recordingCount,
        activeRunCount,
        failedRunCount,
        issueRunCount,
        sharedRunCount,
        plan,
        apiUrl: process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app",
        recentRuns: recentRunRows.map((item) => ({
          ...item,
          sharedAt: item.sharedAt?.toISOString() ?? null,
          captureCount: screenshotCountBySession.get(item.id) ?? 0,
          replayCount: recordingCountBySession.get(item.id) ?? 0,
          startedAt: item.startedAt?.toISOString() ?? new Date().toISOString(),
          endedAt: item.endedAt?.toISOString() ?? null,
        })),
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
