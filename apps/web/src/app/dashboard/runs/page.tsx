import { auth } from "@clerk/nextjs/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { recordings, runs, screenshots } from "@screenshotsmcp/db";
import RunsListClient from "@/app/dashboard/runs/runs-list-client";

export default async function RunsPage() {
  const { userId: clerkId } = await auth();
  const db = getDb();
  const user = await getOrCreateDbUser(clerkId!);

  const runRows = user
    ? await db
        .select({
          id: runs.id,
          status: runs.status,
          executionMode: runs.executionMode,
          startUrl: runs.startUrl,
          finalUrl: runs.finalUrl,
          pageTitle: runs.pageTitle,
          recordingEnabled: runs.recordingEnabled,
          shareToken: runs.shareToken,
          sharedAt: runs.sharedAt,
          viewportWidth: runs.viewportWidth,
          viewportHeight: runs.viewportHeight,
          consoleErrorCount: runs.consoleErrorCount,
          consoleWarningCount: runs.consoleWarningCount,
          networkRequestCount: runs.networkRequestCount,
          networkErrorCount: runs.networkErrorCount,
          startedAt: runs.startedAt,
          endedAt: runs.endedAt,
        })
        .from(runs)
        .where(eq(runs.userId, user.id))
        .orderBy(desc(runs.startedAt), desc(runs.createdAt))
        .limit(50)
    : [];

  const sessionIds = runRows.map((run) => run.id);

  const [screenshotCounts, recordingCounts] = user && sessionIds.length > 0
    ? await Promise.all([
        db
          .select({ sessionId: screenshots.sessionId, count: count() })
          .from(screenshots)
          .where(and(eq(screenshots.userId, user.id), inArray(screenshots.sessionId, sessionIds)))
          .groupBy(screenshots.sessionId),
        db
          .select({ sessionId: recordings.sessionId, count: count() })
          .from(recordings)
          .where(and(eq(recordings.userId, user.id), inArray(recordings.sessionId, sessionIds)))
          .groupBy(recordings.sessionId),
      ])
    : [[], []];

  const screenshotCountBySession = new Map(
    screenshotCounts
      .filter((row) => !!row.sessionId)
      .map((row) => [row.sessionId as string, row.count]),
  );

  const recordingCountBySession = new Map(
    recordingCounts.map((row) => [row.sessionId, row.count]),
  );

  const normalizedRuns = runRows.map((run) => ({
    id: run.id,
    status: run.status,
    executionMode: run.executionMode,
    startUrl: run.startUrl,
    finalUrl: run.finalUrl,
    pageTitle: run.pageTitle,
    recordingEnabled: run.recordingEnabled,
    shareToken: run.shareToken,
    sharedAt: run.sharedAt?.toISOString() ?? null,
    viewportWidth: run.viewportWidth,
    viewportHeight: run.viewportHeight,
    startedAt: run.startedAt?.toISOString() ?? new Date().toISOString(),
    endedAt: run.endedAt?.toISOString() ?? null,
    captureCount: screenshotCountBySession.get(run.id) ?? 0,
    replayCount: recordingCountBySession.get(run.id) ?? 0,
    consoleErrorCount: run.consoleErrorCount ?? 0,
    consoleWarningCount: run.consoleWarningCount ?? 0,
    networkRequestCount: run.networkRequestCount ?? 0,
    networkErrorCount: run.networkErrorCount ?? 0,
  }));

  return (
    <div className="max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold">Runs</h1>
        <p className="text-muted-foreground mt-1">
          Review each browser session in one place instead of jumping between captures and replays.
        </p>
      </div>

      <RunsListClient runs={normalizedRuns} />
    </div>
  );
}
