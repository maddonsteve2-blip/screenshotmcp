"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardWs } from "@/lib/use-dashboard-ws";
import { cn } from "@/lib/utils";
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, Globe, Image as ImageIcon, Monitor, Network, RefreshCw, Search, SquareTerminal, Video } from "lucide-react";
import RunTimelineCarousel from "./run-timeline-carousel";

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function formatEventTime(ts?: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
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

function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ScreenshotItem = {
  id: string;
  url: string;
  status: string;
  publicUrl: string | null;
  width: number;
  height: number | null;
  format: string;
  fullPage: boolean;
  createdAt: string;
  stepIndex: number | null;
  actionLabel: string | null;
  outcome: string | null;
  toolName: string | null;
  captionSource: string | null;
  agentNote: string | null;
  pageTitle: string | null;
  heading: string | null;
};

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

type RunDetails = {
  id: string;
  status: string;
  executionMode: string;
  startUrl: string | null;
  finalUrl: string | null;
  pageTitle: string | null;
  recordingEnabled: boolean;
  shareToken: string | null;
  sharedAt: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string | null;
  consoleLogCount: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  networkRequestCount: number;
  networkErrorCount: number;
};

type RunOutcome = {
  taskType: string | null;
  userGoal: string | null;
  workflowUsed: string | null;
  verdict: string;
  problem: string | null;
  summary: string | null;
  contract: Record<string, unknown>;
  findings: Array<{ id?: string; severity?: string; title?: string; detail?: string; recommendation?: string }>;
  proofCoverage: Record<string, unknown>;
  validity: Record<string, unknown>;
  nextActions: string[];
};

type LiveSnapshotResponse = {
  runId: string;
  status: string;
  live: boolean;
  snapshotAt: string;
  startedAt: string | null;
  lastUsedAt: string | null;
  recordingEnabled: boolean;
  currentUrl: string | null;
  pageTitle: string | null;
  viewport: { width: number; height: number } | null;
  consoleLogs: ConsoleEntry[];
  networkErrors: NetworkErrorEntry[];
  networkRequests: NetworkRequestEntry[];
  consoleLogCount: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  networkRequestCount: number;
  networkErrorCount: number;
};

type Props = {
  run: RunDetails;
  screenshots: ScreenshotItem[];
  recordings: RecordingItem[];
  initialConsoleLogs: ConsoleEntry[];
  initialNetworkErrors: NetworkErrorEntry[];
  initialNetworkRequests: NetworkRequestEntry[];
  outcome: RunOutcome | null;
};

type TabValue = "summary" | "captures" | "replay" | "console" | "network" | "session";

function MetricActionButton({
  header,
  value,
  description,
  onClick,
}: {
  header: ReactNode;
  value: ReactNode;
  description: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto w-full flex-col items-start gap-2 rounded-lg px-4 py-4 text-left"
      onClick={onClick}
    >
      <span className="text-sm font-normal text-muted-foreground">{header}</span>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
      <span className="text-sm font-normal text-muted-foreground">{description}</span>
    </Button>
  );
}

export default function RunDetailTabs({
  run,
  screenshots,
  recordings,
  initialConsoleLogs,
  initialNetworkErrors,
  initialNetworkRequests,
  outcome,
}: Props) {
  const primaryRecording = recordings[0] ?? null;
  const latestScreenshot = screenshots[screenshots.length - 1] ?? null;
  const [activeTab, setActiveTab] = useState<TabValue>("summary");
  const [pollingEnabled, setPollingEnabled] = useState(run.status === "active");
  const [liveSnapshot, setLiveSnapshot] = useState<LiveSnapshotResponse | null>(null);
  const [liveState, setLiveState] = useState<{
    state: "idle" | "refreshing" | "live" | "stale" | "error";
    snapshotAt: string | null;
    error: string | null;
  }>({
    state: run.status === "active" ? "idle" : "stale",
    snapshotAt: null,
    error: null,
  });

  const [consoleQuery, setConsoleQuery] = useState("");
  const [consoleLevel, setConsoleLevel] = useState<"all" | "error" | "warning" | "exception" | "log">("all");
  const [networkQuery, setNetworkQuery] = useState("");
  const [networkScope, setNetworkScope] = useState<"all" | "failed">("all");
  const [networkType, setNetworkType] = useState<string>("all");

  const handleLiveSocketMessage = useCallback((message: { type: string; data?: LiveSnapshotResponse; message?: string }) => {
    if (message.type === "run-live" && message.data) {
      const data = message.data;

      if (data.live) {
        setLiveSnapshot(data);
        setLiveState({ state: "live", snapshotAt: data.snapshotAt ?? new Date().toISOString(), error: null });
        return;
      }

      setLiveSnapshot(null);
      setLiveState({ state: "stale", snapshotAt: data.snapshotAt ?? new Date().toISOString(), error: null });
      if (data.status !== "active") {
        setPollingEnabled(false);
      }
      return;
    }

    if (message.type === "error") {
      setLiveState({
        state: "error",
        snapshotAt: new Date().toISOString(),
        error: message.message ?? "Failed to refresh live snapshot",
      });
    }
  }, []);

  const { refresh: requestLiveRefresh } = useDashboardWs<LiveSnapshotResponse>({
    subscription: { channel: "run-live", runId: run.id },
    onMessage: handleLiveSocketMessage,
  });

  const refreshLiveSnapshot = useCallback(() => {
    setLiveState((current) => ({ ...current, state: "refreshing", error: null }));
    requestLiveRefresh();
  }, [requestLiveRefresh]);

  const effectiveConsoleLogs = liveSnapshot?.consoleLogs ?? initialConsoleLogs;
  const effectiveNetworkErrors = liveSnapshot?.networkErrors ?? initialNetworkErrors;
  const effectiveNetworkRequests = liveSnapshot?.networkRequests ?? initialNetworkRequests;
  const effectiveFinalUrl = liveSnapshot?.currentUrl ?? run.finalUrl ?? run.startUrl;
  const effectivePageTitle = liveSnapshot?.pageTitle ?? run.pageTitle;
  const effectiveViewportWidth = liveSnapshot?.viewport?.width ?? run.viewportWidth;
  const effectiveViewportHeight = liveSnapshot?.viewport?.height ?? run.viewportHeight;
  const effectiveStartedAt = liveSnapshot?.startedAt ?? run.startedAt;
  const effectiveEndedAt = liveSnapshot?.live ? null : run.endedAt;
  const effectiveConsoleLogCount = liveSnapshot?.consoleLogCount ?? run.consoleLogCount;
  const effectiveConsoleErrorCount = liveSnapshot?.consoleErrorCount ?? run.consoleErrorCount;
  const effectiveConsoleWarningCount = liveSnapshot?.consoleWarningCount ?? run.consoleWarningCount;
  const effectiveNetworkRequestCount = liveSnapshot?.networkRequestCount ?? run.networkRequestCount;
  const effectiveNetworkErrorCount = liveSnapshot?.networkErrorCount ?? run.networkErrorCount;
  const totalIssueCount = effectiveConsoleErrorCount + effectiveNetworkErrorCount;
  const evidenceItemCount = screenshots.length + recordings.length;
  const hasPersistedEvidence = evidenceItemCount > 0;
  const outcomeLabel = pollingEnabled
    ? "Active"
    : outcome?.verdict
    ? outcome.verdict.replace(/_/g, " ")
    : run.status === "failed"
    ? "Failed"
    : pollingEnabled
      ? "Active"
      : totalIssueCount > 0
        ? "Needs review"
        : "Healthy";
  const outcomeClassName = pollingEnabled
    ? "border-primary/30 text-primary"
    : outcome?.verdict === "failed"
    ? "border-destructive/30 text-destructive"
    : outcome?.verdict === "needs_review"
      ? "border-border text-foreground"
      : outcome?.verdict === "inconclusive"
        ? "border-amber-300 text-amber-700"
        : run.status === "failed"
    ? "border-destructive/30 text-destructive"
    : pollingEnabled
      ? "border-primary/30 text-primary"
      : totalIssueCount > 0
        ? "border-border text-foreground"
        : "border-primary/20 text-primary";
  const outcomeMessage = outcome?.summary
    ? outcome.summary
    : run.status === "failed"
    ? "The run ended in a failed state and should be reviewed before retrying or sharing outcomes."
    : pollingEnabled
      ? "The run is still active. Live console and network activity may change as the browser continues working."
      : totalIssueCount > 0
        ? `The run completed, but ${totalIssueCount} high-priority issue${totalIssueCount === 1 ? " was" : "s were"} captured across console and network diagnostics.`
        : "The run completed without high-priority console or network failures in the persisted snapshot.";
  const attentionMessage = outcome?.nextActions?.[0]
    ? outcome.nextActions[0]
    : run.status === "failed"
    ? "Prioritize this run for review: it failed before completion and may need a retry or workflow fix."
    : totalIssueCount > 0
      ? `Review the failing diagnostics before trusting this run. ${effectiveNetworkErrorCount} network failure${effectiveNetworkErrorCount === 1 ? "" : "s"} and ${effectiveConsoleErrorCount} console error${effectiveConsoleErrorCount === 1 ? "" : "s"} were recorded.`
      : !hasPersistedEvidence && !pollingEnabled
        ? "This run finished without persisted evidence. If proof is required, rerun with screenshots or recording enabled."
        : run.recordingEnabled && !primaryRecording && !pollingEnabled
          ? "Recording was enabled, but no replay was saved. Use captures and diagnostics to complete the review."
          : "This run is producing the expected evidence and diagnostic coverage so far.";

  const recentConsoleLogs = useMemo(
    () => [...effectiveConsoleLogs].sort((a, b) => b.ts - a.ts),
    [effectiveConsoleLogs],
  );
  const recentRequests = useMemo(
    () => [...effectiveNetworkRequests].sort((a, b) => b.ts - a.ts),
    [effectiveNetworkRequests],
  );
  const recentFailedRequests = useMemo(
    () => recentRequests.filter((entry) => entry.status >= 400),
    [recentRequests],
  );
  const availableNetworkTypes = useMemo(
    () => ["all", ...Array.from(new Set(recentRequests.map((entry) => entry.resourceType).filter(Boolean))).sort()],
    [recentRequests],
  );

  const filteredConsoleLogs = useMemo(() => {
    const query = consoleQuery.trim().toLowerCase();
    return recentConsoleLogs.filter((entry) => {
      const levelMatch = consoleLevel === "all" || entry.level === consoleLevel;
      const queryMatch = !query || entry.text.toLowerCase().includes(query);
      return levelMatch && queryMatch;
    });
  }, [consoleLevel, consoleQuery, recentConsoleLogs]);

  const filteredRequests = useMemo(() => {
    const query = networkQuery.trim().toLowerCase();
    return recentRequests.filter((entry) => {
      const scopeMatch = networkScope === "all" || entry.status >= 400;
      const typeMatch = networkType === "all" || entry.resourceType === networkType;
      const queryMatch = !query || [entry.url, entry.method, entry.statusText, entry.resourceType, String(entry.status)]
        .join(" ")
        .toLowerCase()
        .includes(query);
      return scopeMatch && typeMatch && queryMatch;
    });
  }, [networkQuery, networkScope, networkType, recentRequests]);

  const liveBadge = liveState.state === "live"
    ? { label: "Live", className: "border-primary/20 text-primary" }
    : liveState.state === "refreshing"
      ? { label: "Refreshing", className: "border-primary/30 text-primary" }
      : liveState.state === "error"
        ? { label: "Refresh issue", className: "border-destructive/30 text-destructive" }
        : { label: "Persisted", className: "border-border text-muted-foreground" };

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)} className="flex flex-col gap-6">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="captures">Captures</TabsTrigger>
        <TabsTrigger value="replay">Replay</TabsTrigger>
        <TabsTrigger value="console">Console</TabsTrigger>
        <TabsTrigger value="network">Network</TabsTrigger>
        <TabsTrigger value="session">Session</TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="flex flex-col gap-6">
        {(outcome?.problem || outcome?.summary) && (
          <Card>
            <CardContent className="grid gap-4 p-6 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Problem</div>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {outcome?.problem ?? <span className="text-muted-foreground italic">Agent did not record a problem statement.</span>}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Outcome
                  {outcome?.verdict && (
                    <Badge
                      variant={
                        outcome.verdict === "passed" ? "secondary"
                        : outcome.verdict === "failed" ? "destructive"
                        : "outline"
                      }
                      className="capitalize text-[10px]"
                    >
                      {outcome.verdict}
                    </Badge>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {outcome?.summary ?? <span className="text-muted-foreground italic">Agent did not summarise this run.</span>}
                </p>
              </div>
              {outcome?.nextActions && outcome.nextActions.length > 0 && (
                <div className="md:col-span-2 flex flex-col gap-2 border-t pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next actions</div>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    {outcome.nextActions.map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {screenshots.length > 0 && (
          <RunTimelineCarousel
            steps={screenshots.map((shot) => ({
              id: shot.id,
              publicUrl: shot.publicUrl,
              stepIndex: shot.stepIndex,
              actionLabel: shot.actionLabel,
              outcome: shot.outcome,
              toolName: shot.toolName,
              captionSource: shot.captionSource,
              agentNote: shot.agentNote,
              url: shot.url,
              pageTitle: shot.pageTitle,
              createdAt: shot.createdAt,
            }))}
          />
        )}

        <Card>
          <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("capitalize", liveBadge.className)}>{liveBadge.label}</Badge>
                {pollingEnabled && <Badge variant="outline">Auto-refresh every 5s</Badge>}
              </div>
              <p className="text-sm font-medium">
                {pollingEnabled
                  ? "This run is still active. Live console and network diagnostics will refresh automatically."
                  : "This run is no longer active. Diagnostics below reflect the latest persisted snapshot."}
              </p>
              <p className="text-sm text-muted-foreground">
                Last snapshot: {formatDate(liveState.snapshotAt ?? run.createdAt)}
                {liveSnapshot?.lastUsedAt ? ` · last browser activity ${formatDate(liveSnapshot.lastUsedAt)}` : ""}
              </p>
              {liveState.error && <p className="text-sm text-destructive">{liveState.error}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshLiveSnapshot()}>
              <RefreshCw data-icon="inline-start" className={cn(liveState.state === "refreshing" && "animate-spin")} />
              Refresh now
            </Button>
          </CardContent>
        </Card>

        <Card className={cn(
          "border",
          (run.status === "failed" || totalIssueCount > 0 || (!hasPersistedEvidence && !pollingEnabled) || (run.recordingEnabled && !primaryRecording && !pollingEnabled))
            ? "border-destructive/20 bg-destructive/5"
            : "border-border bg-muted/30",
        )}>
          <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {run.status === "failed" || totalIssueCount > 0 || (!hasPersistedEvidence && !pollingEnabled) ? (
                  <AlertTriangle className="size-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="size-4 text-primary" />
                )}
                <p className="text-sm font-medium">Review priority</p>
              </div>
              <p className="text-sm text-muted-foreground">{attentionMessage}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(effectiveConsoleErrorCount > 0 || effectiveConsoleWarningCount > 0) && (
                <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("console")}>
                  Review console
                </Button>
              )}
              {effectiveNetworkErrorCount > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("network")}>
                  Review network
                </Button>
              )}
              {screenshots.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("captures")}>
                  Open captures
                </Button>
              )}
              {recordings.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("replay")}>
                  Open replay
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)] gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Primary evidence</CardTitle>
              <CardDescription>
                One place to review the main output from this browser session.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {primaryRecording ? (
                <video src={primaryRecording.videoUrl} controls className="aspect-video w-full rounded-lg border bg-black shadow-sm" />
              ) : latestScreenshot?.publicUrl ? (
                <div className="relative h-[72vh] max-h-[72vh] w-full overflow-hidden rounded-lg border bg-muted">
                  <Image
                    src={latestScreenshot.publicUrl}
                    alt={latestScreenshot.url}
                    fill
                    unoptimized
                    sizes="(min-width: 1536px) 50rem, (min-width: 1024px) 60vw, 100vw"
                    className="object-contain"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                  No persisted primary evidence yet for this run.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Executive summary</CardTitle>
                <CardDescription>Outcome, highest-signal findings, and what to do next.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 text-base">
                <div className="flex flex-col gap-2 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn("capitalize", outcomeClassName)}>{outcomeLabel}</Badge>
                    {run.recordingEnabled && <Badge variant="outline">Recording enabled</Badge>}
                    {run.shareToken && <Badge variant="secondary">Shared</Badge>}
                    {outcome?.workflowUsed && <Badge variant="outline">{outcome.workflowUsed}</Badge>}
                  </div>
                  <p className="font-medium">{outcomeMessage}</p>
                  {outcome?.userGoal && <p className="text-sm text-muted-foreground">Goal: {outcome.userGoal}</p>}
                  <p className="text-sm text-muted-foreground break-all">{effectiveFinalUrl ?? run.startUrl ?? "Managed browser session"}</p>
                  {run.shareToken && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Globe className="h-3.5 w-3.5" />
                        Public review enabled{run.sharedAt ? ` · updated ${formatDate(run.sharedAt)}` : ""}
                      </span>
                      <Link
                        href={`/shared/runs/${encodeURIComponent(run.shareToken)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Open shared page
                      </Link>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <MetricActionButton
                    onClick={() => setActiveTab("console")}
                    header="Console findings"
                    value={effectiveConsoleErrorCount}
                    description={`${effectiveConsoleWarningCount} warnings recorded`}
                  />
                  <MetricActionButton
                    onClick={() => setActiveTab("network")}
                    header="Network findings"
                    value={effectiveNetworkErrorCount}
                    description={`failed of ${effectiveNetworkRequestCount} requests`}
                  />
                </div>

                {outcome && (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="flex flex-col gap-3 rounded-lg border p-4">
                      <p className="text-sm font-medium">Top findings</p>
                      {outcome.findings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No structured findings were saved for this run.</p>
                      ) : (
                        outcome.findings.slice(0, 3).map((finding, index) => (
                          <div key={finding.id ?? `${finding.title}-${index}`} className="flex flex-col gap-1">
                            <p className="font-medium">{finding.title ?? "Finding"}</p>
                            <p className="text-sm text-muted-foreground">{finding.detail ?? "No detail recorded."}</p>
                            {finding.recommendation && <p className="text-sm">Next: {finding.recommendation}</p>}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex flex-col gap-3 rounded-lg border p-4">
                      <p className="text-sm font-medium">Next actions</p>
                      {outcome.nextActions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No follow-up actions were saved for this run.</p>
                      ) : (
                        outcome.nextActions.slice(0, 4).map((action, index) => (
                          <p key={`${action}-${index}`} className="text-sm text-muted-foreground">{index + 1}. {action}</p>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Started</span>
                    <span className="font-medium text-right">{formatDate(effectiveStartedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-medium text-right">{formatDuration(effectiveStartedAt, effectiveEndedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Page title</span>
                    <span className="font-medium text-right">{effectivePageTitle ?? "—"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Evidence coverage</CardTitle>
                <CardDescription>How much proof and diagnostic coverage this run produced.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 text-base">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <MetricActionButton
                    onClick={() => setActiveTab("captures")}
                    header={<span className="inline-flex items-center gap-2"><ImageIcon className="size-4" />Captures</span>}
                    value={screenshots.length}
                    description="Persisted screenshots for this run"
                  />
                  <MetricActionButton
                    onClick={() => setActiveTab("replay")}
                    header={<span className="inline-flex items-center gap-2"><Video className="size-4" />Replays</span>}
                    value={recordings.length}
                    description="Saved recording outputs"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Viewport</span>
                    <span className="font-medium text-right">{effectiveViewportWidth ?? "—"}×{effectiveViewportHeight ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Diagnostics</span>
                    <span className="font-medium text-right">{effectiveConsoleLogCount} console events · {effectiveNetworkRequestCount} requests</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Evidence readiness</span>
                    <span className="font-medium text-right">{hasPersistedEvidence ? `${evidenceItemCount} items saved` : pollingEnabled ? "Awaiting persisted evidence" : "No evidence saved"}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href="/dashboard/artifacts" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                    Open artifact library
                  </Link>
                  <Link href="/dashboard/runs" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                    Back to runs
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Console signals</CardTitle>
              <CardDescription>Recent errors, warnings, and diagnostic messages from the session.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentConsoleLogs.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No console output was persisted for this run.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {recentConsoleLogs.slice(0, 6).map((entry, index) => (
                    <div key={`${entry.ts}-${index}`} className="flex flex-col gap-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize",
                            (entry.level === "error" || entry.level === "exception") && "border-destructive/30 text-destructive",
                          )}
                        >
                          {entry.level}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{formatEventTime(entry.ts)}</span>
                      </div>
                      <pre className="whitespace-pre-wrap break-words text-sm font-mono text-foreground">{entry.text}</pre>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Network failures</CardTitle>
              <CardDescription>Recent failed requests captured during the session.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentFailedRequests.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No failed network requests were persisted for this run.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {recentFailedRequests.slice(0, 6).map((entry, index) => (
                    <div key={`${entry.url}-${entry.ts}-${index}`} className="flex flex-col gap-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-destructive/30 text-destructive">{entry.status}</Badge>
                          <span className="text-sm font-medium">{entry.method}</span>
                          <span className="text-sm text-muted-foreground uppercase">{entry.resourceType}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">{formatEventTime(entry.ts)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground break-all">{entry.url}</p>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span>{entry.statusText}</span>
                        <span>{entry.duration}ms</span>
                        <span>{formatBytes(entry.size)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="captures" className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Session captures</CardTitle>
            <CardDescription>Persisted screenshots captured during this run.</CardDescription>
          </CardHeader>
          <CardContent>
            {screenshots.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                No captures were persisted for this run yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {screenshots.map((shot) => (
                  <Card key={shot.id} className="overflow-hidden">
                    <div className="relative h-56 overflow-hidden bg-muted md:h-64">
                      {shot.publicUrl ? (
                        <Image src={shot.publicUrl} alt={shot.url} fill unoptimized sizes="(min-width: 1280px) 50vw, 100vw" className="object-cover object-top" />
                      ) : (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Pending</div>
                      )}
                    </div>
                    <CardContent className="flex flex-col gap-3 p-4">
                      <p className="truncate text-sm text-muted-foreground" title={shot.url}>{shot.url}</p>
                      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                        <span>{shot.width}×{shot.height ?? "—"} · {shot.format.toUpperCase()}</span>
                        {shot.publicUrl && (
                          <Link href={shot.publicUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}>
                            Open <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="replay" className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Replay</CardTitle>
            <CardDescription>Recorded video evidence for this run.</CardDescription>
          </CardHeader>
          <CardContent>
            {primaryRecording ? (
              <div className="flex flex-col gap-4">
                <video src={primaryRecording.videoUrl} controls className="aspect-video w-full rounded-lg border bg-black shadow-sm" />
                <div className="flex flex-wrap items-center gap-4 text-base text-muted-foreground">
                  <span>{primaryRecording.durationMs ? `${Math.floor(primaryRecording.durationMs / 1000)}s` : "—"}</span>
                  <span>{primaryRecording.viewportWidth ?? "—"}×{primaryRecording.viewportHeight ?? "—"}</span>
                  <Link href={primaryRecording.videoUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}>
                    Open video <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                No replay video was saved for this run.
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="console" className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Console activity</CardTitle>
            <CardDescription>Search, filter, and review persisted or live console output for this run.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={consoleQuery}
                  onChange={(event) => setConsoleQuery(event.target.value)}
                  placeholder="Search console messages"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(["all", "error", "warning", "exception", "log"] as const).map((level) => (
                  <Button
                    key={level}
                    type="button"
                    size="sm"
                    variant={consoleLevel === level ? "default" : "outline"}
                    onClick={() => setConsoleLevel(level)}
                    className="capitalize"
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>Showing {filteredConsoleLogs.length} of {effectiveConsoleLogs.length} console events</span>
              <span>{effectiveConsoleErrorCount} errors</span>
              <span>{effectiveConsoleWarningCount} warnings</span>
            </div>

            {filteredConsoleLogs.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                No console events matched the current filters.
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-[120px_180px_1fr] gap-4 border-b bg-muted/40 px-4 py-3 text-sm font-medium text-muted-foreground">
                  <span>Level</span>
                  <span>Timestamp</span>
                  <span>Message</span>
                </div>
                <div className="max-h-[640px] overflow-auto divide-y">
                  {filteredConsoleLogs.map((entry, index) => (
                    <div key={`${entry.ts}-${index}`} className="grid grid-cols-[120px_180px_1fr] gap-4 px-4 py-3 text-sm">
                      <div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize",
                            (entry.level === "error" || entry.level === "exception") && "border-destructive/30 text-destructive",
                          )}
                        >
                          {entry.level}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">{formatEventTime(entry.ts)}</span>
                      <pre className="whitespace-pre-wrap break-words text-sm font-mono">{entry.text}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="network" className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Network activity</CardTitle>
            <CardDescription>Search and filter request traffic for failed calls, resource classes, and URLs.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={networkQuery}
                  onChange={(event) => setNetworkQuery(event.target.value)}
                  placeholder="Search URLs, status, method"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={networkScope === "all" ? "default" : "outline"} onClick={() => setNetworkScope("all")}>
                  All requests
                </Button>
                <Button type="button" size="sm" variant={networkScope === "failed" ? "default" : "outline"} onClick={() => setNetworkScope("failed")}>
                  Failed only
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {availableNetworkTypes.map((type) => (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant={networkType === type ? "default" : "outline"}
                  onClick={() => setNetworkType(type)}
                  className="capitalize"
                >
                  {type === "all" ? "All types" : type}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>Showing {filteredRequests.length} of {effectiveNetworkRequests.length} requests</span>
              <span>{effectiveNetworkErrorCount} failed</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[0.72fr_1.28fr] gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Failed requests</CardTitle>
                  <CardDescription>High-signal failures captured for this run.</CardDescription>
                </CardHeader>
                <CardContent>
                  {effectiveNetworkErrors.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      No failed requests were persisted for this run.
                    </div>
                  ) : (
                    <div className="flex max-h-[640px] flex-col gap-3 overflow-auto">
                      {effectiveNetworkErrors
                        .slice()
                        .sort((a, b) => b.ts - a.ts)
                        .map((entry, index) => (
                          <div key={`${entry.url}-${entry.ts}-${index}`} className="flex flex-col gap-2 rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-3">
                              <Badge variant="outline" className="border-destructive/30 text-destructive">{entry.status}</Badge>
                              <span className="text-sm text-muted-foreground">{formatEventTime(entry.ts)}</span>
                            </div>
                            <p className="text-sm font-medium">{entry.statusText}</p>
                            <p className="text-sm text-muted-foreground break-all">{entry.url}</p>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Request activity</CardTitle>
                  <CardDescription>Filtered request traffic for this run.</CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredRequests.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      No request activity matched the current filters.
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <div className="grid grid-cols-[90px_90px_90px_90px_90px_1fr] gap-3 border-b bg-muted/40 px-4 py-3 text-sm font-medium text-muted-foreground">
                        <span>Method</span>
                        <span>Status</span>
                        <span>Type</span>
                        <span>Duration</span>
                        <span>Size</span>
                        <span>URL</span>
                      </div>
                      <div className="max-h-[640px] overflow-auto divide-y">
                        {filteredRequests.map((entry, index) => (
                          <div key={`${entry.url}-${entry.ts}-${index}`} className="grid grid-cols-[90px_90px_90px_90px_90px_1fr] gap-3 px-4 py-3 text-sm">
                            <span className="font-medium">{entry.method}</span>
                            <span className={cn(entry.status >= 400 ? "text-destructive" : "text-foreground")}>{entry.status}</span>
                            <span className="uppercase text-muted-foreground">{entry.resourceType}</span>
                            <span>{entry.duration}ms</span>
                            <span>{formatBytes(entry.size)}</span>
                            <span className="truncate text-muted-foreground" title={entry.url}>{entry.url}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="session" className="flex flex-col gap-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Session metadata</CardTitle>
              <CardDescription>Core run metadata captured for audit, debugging, and replay.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-base">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Session ID</span>
                <span className="font-mono text-right break-all">{run.id}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium capitalize">{liveSnapshot?.status ?? run.status}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Execution mode</span>
                <span className="font-medium capitalize">{run.executionMode}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Recording enabled</span>
                <span className="font-medium">{run.recordingEnabled ? "Yes" : "No"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Viewport</span>
                <span className="font-medium">{effectiveViewportWidth ?? "—"}×{effectiveViewportHeight ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Started</span>
                <span className="font-medium text-right">{formatDate(effectiveStartedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Last browser activity</span>
                <span className="font-medium text-right">{formatDate(liveSnapshot?.lastUsedAt ?? liveState.snapshotAt)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Observed page state</CardTitle>
              <CardDescription>Resolved page metadata and persisted diagnostic counts.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Start URL</span>
                <span className="font-medium text-right break-all">{run.startUrl ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Current / final URL</span>
                <span className="font-medium text-right break-all">{effectiveFinalUrl ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Page title</span>
                <span className="font-medium text-right">{effectivePageTitle ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Console events</span>
                <span className="font-medium">{effectiveConsoleLogCount}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Console errors</span>
                <span className="font-medium">{effectiveConsoleErrorCount}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Warnings</span>
                <span className="font-medium">{effectiveConsoleWarningCount}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Network requests</span>
                <span className="font-medium">{effectiveNetworkRequestCount}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Failed requests</span>
                <span className="font-medium">{effectiveNetworkErrorCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" /> Evidence coverage</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {screenshots.length} captures and {recordings.length} replay artifacts are linked to this run.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4" /> Failure surface</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {effectiveConsoleErrorCount} console errors and {effectiveNetworkErrorCount} failed requests were captured for review.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4" /> Navigation state</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground break-all">
              Current resolved page: {effectiveFinalUrl ?? run.startUrl ?? "Not available"}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><SquareTerminal className="h-4 w-4" /> Console coverage</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Source: {liveSnapshot ? "live in-memory session" : "persisted run snapshot"}.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Network className="h-4 w-4" /> Request volume</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {effectiveNetworkRequestCount} requests captured with {effectiveNetworkErrorCount} failures.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Monitor className="h-4 w-4" /> Viewport state</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Last known viewport: {effectiveViewportWidth ?? "—"}×{effectiveViewportHeight ?? "—"}.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4" /> Snapshot cadence</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Last diagnostics snapshot: {formatDate(liveState.snapshotAt ?? run.createdAt)}.
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}
