import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { runs, screenshots } from "@screenshotsmcp/db";
import RunDetailTabs from "./run-detail-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Clock, Image as ImageIcon, Monitor, Network, SquareTerminal } from "lucide-react";

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function formatDuration(startedAt?: string | null, endedAt?: string | null) {
  if (!startedAt) return "—";
  if (!endedAt) return "In progress";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms <= 0) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function prettyHost(input?: string | null) {
  if (!input) return "Managed browser session";
  try {
    return new URL(input).hostname;
  } catch {
    return input;
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

type RecordingItem = {
  id: string;
  sessionId: string;
  pageUrl: string | null;
  fileSize: number | null;
  durationMs: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  createdAt: string;
  videoUrl: string;
};

type ConsoleEntry = {
  level: string;
  text: string;
  ts: number;
};

type NetworkErrorEntry = {
  url: string;
  status: number;
  statusText: string;
  ts: number;
};

type NetworkRequestEntry = {
  url: string;
  method: string;
  status: number;
  statusText: string;
  resourceType: string;
  duration: number;
  size: number;
  ts: number;
};

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  const db = getDb();
  const user = await getOrCreateDbUser(clerkId!);
  const { id } = await params;

  if (!user) {
    notFound();
  }

  const [run] = await db
    .select({
      id: runs.id,
      status: runs.status,
      executionMode: runs.executionMode,
      startUrl: runs.startUrl,
      finalUrl: runs.finalUrl,
      pageTitle: runs.pageTitle,
      recordingEnabled: runs.recordingEnabled,
      viewportWidth: runs.viewportWidth,
      viewportHeight: runs.viewportHeight,
      consoleLogs: runs.consoleLogs,
      networkErrors: runs.networkErrors,
      networkRequests: runs.networkRequests,
      consoleLogCount: runs.consoleLogCount,
      consoleErrorCount: runs.consoleErrorCount,
      consoleWarningCount: runs.consoleWarningCount,
      networkRequestCount: runs.networkRequestCount,
      networkErrorCount: runs.networkErrorCount,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
      createdAt: runs.createdAt,
    })
    .from(runs)
    .where(and(eq(runs.id, id), eq(runs.userId, user.id)));

  if (!run) {
    notFound();
  }

  const screenshotRows = await db
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
    .where(and(eq(screenshots.userId, user.id), eq(screenshots.sessionId, id)))
    .orderBy(asc(screenshots.createdAt));

  const recordingRes = clerkId
    ? await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app"}/v1/recordings?sessionId=${encodeURIComponent(id)}`,
        {
          headers: { Authorization: `Bearer ${clerkId}` },
          cache: "no-store",
        },
      ).catch(() => null)
    : null;

  const recordingData = recordingRes && recordingRes.ok
    ? await recordingRes.json()
    : { recordings: [] as RecordingItem[] };

  const recordingsForRun = (recordingData.recordings ?? []) as RecordingItem[];
  const consoleLogs = parseJson<ConsoleEntry[]>(run.consoleLogs, []);
  const networkErrors = parseJson<NetworkErrorEntry[]>(run.networkErrors, []);
  const networkRequests = parseJson<NetworkRequestEntry[]>(run.networkRequests, []);

  const startedAt = run.startedAt?.toISOString() ?? null;
  const endedAt = run.endedAt?.toISOString() ?? null;
  const createdAt = run.createdAt?.toISOString() ?? null;
  const screenshotRowsForClient = screenshotRows.map((shot) => ({
    ...shot,
    createdAt: shot.createdAt.toISOString(),
  }));
  const runForClient = {
    id: run.id,
    status: run.status,
    executionMode: run.executionMode,
    startUrl: run.startUrl,
    finalUrl: run.finalUrl,
    pageTitle: run.pageTitle,
    recordingEnabled: run.recordingEnabled,
    viewportWidth: run.viewportWidth,
    viewportHeight: run.viewportHeight,
    startedAt,
    endedAt,
    createdAt,
    consoleLogCount: run.consoleLogCount,
    consoleErrorCount: run.consoleErrorCount,
    consoleWarningCount: run.consoleWarningCount,
    networkRequestCount: run.networkRequestCount,
    networkErrorCount: run.networkErrorCount,
  };

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      <div className="space-y-4">
        <Link href="/dashboard/runs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to runs
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{run.pageTitle || prettyHost(run.startUrl)}</h1>
              <Badge variant={run.status === "completed" ? "secondary" : "outline"} className="capitalize">
                {run.status}
              </Badge>
              <Badge variant="outline" className="capitalize">{run.executionMode}</Badge>
              {run.recordingEnabled && <Badge variant="outline">Recording enabled</Badge>}
            </div>
            <p className="text-muted-foreground break-all">{run.finalUrl ?? run.startUrl ?? "Managed browser session"}</p>
            <p className="text-xs text-muted-foreground font-mono">Session ID: {run.id}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Started</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{formatDate(startedAt)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{formatDuration(startedAt, endedAt)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Viewport</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{run.viewportWidth ?? "—"}×{run.viewportHeight ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Evidence</CardTitle>
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{screenshotRows.length} captures · {recordingsForRun.length} replays</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Requests</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{run.networkRequestCount} total · {run.networkErrorCount} failed</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Console</CardTitle>
            <SquareTerminal className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{run.consoleLogCount} events · {run.consoleErrorCount} errors</div>
          </CardContent>
        </Card>
      </div>

      <RunDetailTabs
        run={runForClient}
        screenshots={screenshotRowsForClient}
        recordings={recordingsForRun}
        initialConsoleLogs={consoleLogs}
        initialNetworkErrors={networkErrors}
        initialNetworkRequests={networkRequests}
      />
    </div>
  );
}
