"use client";

import { useCallback, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardWs } from "@/lib/use-dashboard-ws";
import type {
  ConsoleEntry,
  LiveSnapshotResponse,
  NetworkErrorEntry,
  NetworkRequestEntry,
  RecordingItem,
  RunDetails,
  RunOutcome,
  ScreenshotItem,
  TabValue,
} from "./run-detail-types";
import { CapturesTab } from "./tabs/captures-tab";
import { ReplayTab } from "./tabs/replay-tab";
import { ConsoleTab, type ConsoleLevel } from "./tabs/console-tab";
import { NetworkTab, type NetworkScope } from "./tabs/network-tab";
import { SessionTab } from "./tabs/session-tab";
import { SummaryTab } from "./tabs/summary-tab";

type Props = {
  run: RunDetails;
  screenshots: ScreenshotItem[];
  recordings: RecordingItem[];
  initialConsoleLogs: ConsoleEntry[];
  initialNetworkErrors: NetworkErrorEntry[];
  initialNetworkRequests: NetworkRequestEntry[];
  outcome: RunOutcome | null;
};

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
  const [consoleLevel, setConsoleLevel] = useState<ConsoleLevel>("all");
  const [networkQuery, setNetworkQuery] = useState("");
  const [networkScope, setNetworkScope] = useState<NetworkScope>("all");
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
        <SummaryTab
          run={run}
          screenshots={screenshots}
          recordings={recordings}
          primaryRecording={primaryRecording}
          latestScreenshot={latestScreenshot}
          outcome={outcome}
          pollingEnabled={pollingEnabled}
          liveSnapshot={liveSnapshot}
          liveState={liveState}
          liveBadge={liveBadge}
          onRefresh={() => void refreshLiveSnapshot()}
          onNavigate={setActiveTab}
          outcomeLabel={outcomeLabel}
          outcomeClassName={outcomeClassName}
          outcomeMessage={outcomeMessage}
          attentionMessage={attentionMessage}
          effectiveFinalUrl={effectiveFinalUrl}
          effectiveStartedAt={effectiveStartedAt}
          effectiveEndedAt={effectiveEndedAt}
          effectivePageTitle={effectivePageTitle}
          effectiveViewportWidth={effectiveViewportWidth}
          effectiveViewportHeight={effectiveViewportHeight}
          effectiveConsoleLogCount={effectiveConsoleLogCount}
          effectiveConsoleErrorCount={effectiveConsoleErrorCount}
          effectiveConsoleWarningCount={effectiveConsoleWarningCount}
          effectiveNetworkRequestCount={effectiveNetworkRequestCount}
          effectiveNetworkErrorCount={effectiveNetworkErrorCount}
          hasPersistedEvidence={hasPersistedEvidence}
          evidenceItemCount={evidenceItemCount}
          totalIssueCount={totalIssueCount}
          recentConsoleLogs={recentConsoleLogs}
          recentFailedRequests={recentFailedRequests}
        />
      </TabsContent>
      <TabsContent value="captures" className="flex flex-col gap-6">
        <CapturesTab runId={run.id} screenshots={screenshots} />
      </TabsContent>

      <TabsContent value="replay" className="flex flex-col gap-6">
        <ReplayTab runId={run.id} primaryRecording={primaryRecording} recordingEnabled={run.recordingEnabled} />
      </TabsContent>

      <TabsContent value="console" className="flex flex-col gap-6">
        <ConsoleTab
          consoleQuery={consoleQuery}
          onConsoleQueryChange={setConsoleQuery}
          consoleLevel={consoleLevel}
          onConsoleLevelChange={setConsoleLevel}
          filteredConsoleLogs={filteredConsoleLogs}
          totalConsoleLogs={effectiveConsoleLogs.length}
          errorCount={effectiveConsoleErrorCount}
          warningCount={effectiveConsoleWarningCount}
        />
      </TabsContent>

      <TabsContent value="network" className="flex flex-col gap-6">
        <NetworkTab
          networkQuery={networkQuery}
          onNetworkQueryChange={setNetworkQuery}
          networkScope={networkScope}
          onNetworkScopeChange={setNetworkScope}
          networkType={networkType}
          onNetworkTypeChange={setNetworkType}
          availableNetworkTypes={availableNetworkTypes}
          filteredRequests={filteredRequests}
          totalRequests={effectiveNetworkRequests.length}
          failedCount={effectiveNetworkErrorCount}
          networkErrors={effectiveNetworkErrors}
        />
      </TabsContent>

      <TabsContent value="session" className="flex flex-col gap-6">
        <SessionTab
          run={run}
          liveSnapshot={liveSnapshot}
          liveSnapshotAt={liveState.snapshotAt}
          effectiveFinalUrl={effectiveFinalUrl}
          effectivePageTitle={effectivePageTitle}
          effectiveViewportWidth={effectiveViewportWidth}
          effectiveViewportHeight={effectiveViewportHeight}
          effectiveStartedAt={effectiveStartedAt}
          effectiveConsoleLogCount={effectiveConsoleLogCount}
          effectiveConsoleErrorCount={effectiveConsoleErrorCount}
          effectiveConsoleWarningCount={effectiveConsoleWarningCount}
          effectiveNetworkRequestCount={effectiveNetworkRequestCount}
          effectiveNetworkErrorCount={effectiveNetworkErrorCount}
          screenshotCount={screenshots.length}
          recordingCount={recordings.length}
        />
      </TabsContent>
    </Tabs>
  );
}
