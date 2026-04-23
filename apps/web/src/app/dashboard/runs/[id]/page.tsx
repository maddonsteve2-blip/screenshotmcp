import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { getInternalApiBase, getInternalApiHeaders } from "@/lib/internal-api";
import { runOutcomes, runs, screenshots } from "@screenshotsmcp/db";
import RunDetailTabs from "./run-detail-tabs";
import RunShareDialog from "./run-share-dialog";
import { RunCopyMarkdownButton } from "./run-copy-markdown-button";
import { CopyInlineButton } from "./copy-inline-button";
import { RunDetailHeaderLive } from "./run-detail-header-live";
import { ArrowLeft } from "lucide-react";
import { PageContainer } from "@/components/page-container";

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
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

type RunOutcome = {
  taskType: string | null;
  userGoal: string | null;
  workflowUsed: string | null;
  verdict: string;
  problem: string | null;
  summary: string | null;
  contract: Record<string, unknown>;
  findings: Array<Record<string, unknown>>;
  proofCoverage: Record<string, unknown>;
  validity: Record<string, unknown>;
  nextActions: string[];
};

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");
  const db = getDb();
  const user = await getOrCreateDbUser(clerkId);
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
      shareToken: runs.shareToken,
      sharedAt: runs.sharedAt,
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
      stepIndex: screenshots.stepIndex,
      actionLabel: screenshots.actionLabel,
      outcome: screenshots.outcome,
      toolName: screenshots.toolName,
      captionSource: screenshots.captionSource,
      agentNote: screenshots.agentNote,
      pageTitle: screenshots.pageTitle,
      heading: screenshots.heading,
    })
    .from(screenshots)
    .where(and(eq(screenshots.userId, user.id), eq(screenshots.sessionId, id)))
    .orderBy(asc(screenshots.stepIndex), asc(screenshots.createdAt));

  const recordingRes = user
    ? await (async () => {
        try {
          return await fetch(`${getInternalApiBase()}/v1/recordings?sessionId=${encodeURIComponent(id)}`, {
            headers: getInternalApiHeaders(user.id),
            cache: "no-store",
          });
        } catch {
          return null;
        }
      })()
    : null;

  const recordingData = recordingRes && recordingRes.ok
    ? await recordingRes.json()
    : { recordings: [] as RecordingItem[] };

  const [outcomeRow] = await db
    .select({
      taskType: runOutcomes.taskType,
      userGoal: runOutcomes.userGoal,
      workflowUsed: runOutcomes.workflowUsed,
      verdict: runOutcomes.verdict,
      problem: runOutcomes.problem,
      summary: runOutcomes.summary,
      contract: runOutcomes.contract,
      findings: runOutcomes.findings,
      proofCoverage: runOutcomes.proofCoverage,
      validity: runOutcomes.validity,
      nextActions: runOutcomes.nextActions,
    })
    .from(runOutcomes)
    .where(eq(runOutcomes.runId, id));

  const recordingsForRun = (recordingData.recordings ?? []) as RecordingItem[];
  const consoleLogs = parseJson<ConsoleEntry[]>(run.consoleLogs, []);
  const networkErrors = parseJson<NetworkErrorEntry[]>(run.networkErrors, []);
  const networkRequests = parseJson<NetworkRequestEntry[]>(run.networkRequests, []);
  const outcomeForClient: RunOutcome | null = outcomeRow ? {
    taskType: outcomeRow.taskType,
    userGoal: outcomeRow.userGoal,
    workflowUsed: outcomeRow.workflowUsed,
    verdict: outcomeRow.verdict,
    problem: outcomeRow.problem,
    summary: outcomeRow.summary,
    contract: parseJson(outcomeRow.contract, {}),
    findings: parseJson(outcomeRow.findings, []),
    proofCoverage: parseJson(outcomeRow.proofCoverage, {}),
    validity: parseJson(outcomeRow.validity, {}),
    nextActions: parseJson(outcomeRow.nextActions, []),
  } : null;

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
    shareToken: run.shareToken,
    sharedAt: run.sharedAt?.toISOString() ?? null,
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
    <PageContainer width="data" className="space-y-8">
      <div className="space-y-4">
        <Link href="/dashboard/runs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to runs
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 min-w-0">
            <h1 className="text-2xl font-bold">{run.pageTitle || prettyHost(run.startUrl)}</h1>
            <p className="text-base text-muted-foreground break-all">{run.finalUrl ?? run.startUrl ?? "Managed browser session"}</p>
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground font-mono">
              <span>Session ID: {run.id}</span>
              <CopyInlineButton value={run.id} label="Copy session ID" />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RunCopyMarkdownButton
              run={{
                runId: run.id,
                pageTitle: run.pageTitle,
                startUrl: run.startUrl,
                finalUrl: run.finalUrl,
                status: run.status,
                executionMode: run.executionMode,
                recordingEnabled: run.recordingEnabled,
                viewportWidth: run.viewportWidth,
                viewportHeight: run.viewportHeight,
                startedAt,
                endedAt,
                consoleLogCount: run.consoleLogCount,
                consoleErrorCount: run.consoleErrorCount,
                consoleWarningCount: run.consoleWarningCount,
                networkRequestCount: run.networkRequestCount,
                networkErrorCount: run.networkErrorCount,
                captureCount: screenshotRowsForClient.length,
                recordingCount: recordingsForRun.length,
                shareUrl: run.shareToken
                  ? `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.screenshotmcp.com"}/shared/runs/${run.shareToken}`
                  : null,
                outcomeSummary: outcomeForClient?.summary ?? null,
                outcomeVerdict: outcomeForClient?.verdict ?? null,
              }}
            />
            <RunShareDialog runId={run.id} />
          </div>
        </div>
      </div>

      <RunDetailHeaderLive
        runId={run.id}
        initialStatus={run.status}
        executionMode={run.executionMode}
        recordingEnabled={run.recordingEnabled}
        startedAt={startedAt}
        endedAt={endedAt}
        viewportWidth={run.viewportWidth}
        viewportHeight={run.viewportHeight}
        shareToken={run.shareToken}
        sharedAt={run.sharedAt?.toISOString() ?? null}
        initialCaptureCount={screenshotRows.length}
        initialRecordingCount={recordingsForRun.length}
        initialConsoleLogCount={run.consoleLogCount}
        initialConsoleErrorCount={run.consoleErrorCount}
        initialNetworkRequestCount={run.networkRequestCount}
        initialNetworkErrorCount={run.networkErrorCount}
      />

      <RunDetailTabs
        run={runForClient}
        screenshots={screenshotRowsForClient}
        recordings={recordingsForRun}
        initialConsoleLogs={consoleLogs}
        initialNetworkErrors={networkErrors}
        initialNetworkRequests={networkRequests}
        outcome={outcomeForClient}
      />
    </PageContainer>
  );
}
