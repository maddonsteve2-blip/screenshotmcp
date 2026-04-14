import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { recordings, runs, screenshots } from "@screenshotsmcp/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Clock, Image as ImageIcon, Video } from "lucide-react";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(startedAt: string, endedAt?: string | null) {
  if (!endedAt) return "In progress";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms <= 0) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function hostname(input?: string | null) {
  if (!input) return "Managed browser run";
  try {
    return new URL(input).hostname;
  } catch {
    return input;
  }
}

export default async function RunsPage() {
  const { userId: clerkId } = await auth();
  const db = getDb();
  const user = await getOrCreateDbUser(clerkId!);

  const runRows = user
    ? await db
        .select({
          id: runs.id,
          status: runs.status,
          startUrl: runs.startUrl,
          recordingEnabled: runs.recordingEnabled,
          viewportWidth: runs.viewportWidth,
          viewportHeight: runs.viewportHeight,
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

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Runs</h1>
        <p className="text-muted-foreground mt-1">
          Review each browser session in one place instead of jumping between captures and replays.
        </p>
      </div>

      {runRows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Video className="h-10 w-10 text-muted-foreground/30" />
            <p className="font-medium">No runs yet</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Start an interactive browser workflow and your runs will appear here with their screenshots and replay evidence.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {runRows.map((run) => {
            const captureCount = screenshotCountBySession.get(run.id) ?? 0;
            const replayCount = recordingCountBySession.get(run.id) ?? 0;
            const startedAt = run.startedAt?.toISOString() ?? new Date().toISOString();
            const endedAt = run.endedAt?.toISOString() ?? null;

            return (
              <Link key={run.id} href={`/dashboard/runs/${run.id}`} className="block">
                <Card className="transition-colors hover:border-primary/40 hover:bg-accent/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-base">{hostname(run.startUrl)}</CardTitle>
                          <Badge variant={run.status === "completed" ? "secondary" : "outline"} className="capitalize">
                            {run.status}
                          </Badge>
                          {run.recordingEnabled && <Badge variant="outline">Recording enabled</Badge>}
                        </div>
                        <CardDescription className="truncate">
                          {run.startUrl ?? "Managed browser session"}
                        </CardDescription>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="font-mono text-xs">{run.id}</span>
                      <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{timeAgo(startedAt)}</span>
                      <span>{formatDuration(startedAt, endedAt)}</span>
                      <span>{run.viewportWidth ?? "—"}×{run.viewportHeight ?? "—"}</span>
                      <span className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />{captureCount} captures</span>
                      <span className="flex items-center gap-1.5"><Video className="h-3.5 w-3.5" />{replayCount} replays</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
