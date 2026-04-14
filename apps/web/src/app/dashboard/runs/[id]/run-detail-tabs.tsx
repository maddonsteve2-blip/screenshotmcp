"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Activity, AlertTriangle, ExternalLink, Globe, Image as ImageIcon, Monitor, Network, RefreshCw, Search, SquareTerminal } from "lucide-react";

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
};

export default function RunDetailTabs({
  run,
  screenshots,
  recordings,
  initialConsoleLogs,
  initialNetworkErrors,
  initialNetworkRequests,
}: Props) {
  const primaryRecording = recordings[0] ?? null;
  const latestScreenshot = screenshots[screenshots.length - 1] ?? null;
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

  const refreshLiveSnapshot = useCallback(async () => {
    setLiveState((current) => ({ ...current, state: "refreshing", error: null }));
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(run.id)}/live`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to refresh live snapshot");
      }

      if (data.live) {
        setLiveSnapshot(data as LiveSnapshotResponse);
        setLiveState({ state: "live", snapshotAt: data.snapshotAt ?? new Date().toISOString(), error: null });
        return;
      }

      setLiveSnapshot(null);
      setLiveState({ state: "stale", snapshotAt: data.snapshotAt ?? new Date().toISOString(), error: null });
      if (data.status !== "active") {
        setPollingEnabled(false);
      }
    } catch (error) {
      setLiveState({
        state: "error",
        snapshotAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Failed to refresh live snapshot",
      });
    }
  }, [run.id]);

  useEffect(() => {
    if (!pollingEnabled) return;
    void refreshLiveSnapshot();
    const intervalId = window.setInterval(() => {
      void refreshLiveSnapshot();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [pollingEnabled, refreshLiveSnapshot]);

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
    ? { label: "Live", className: "border-emerald-200 text-emerald-700" }
    : liveState.state === "refreshing"
      ? { label: "Refreshing", className: "border-blue-200 text-blue-700" }
      : liveState.state === "error"
        ? { label: "Refresh issue", className: "border-red-200 text-red-700" }
        : { label: "Persisted", className: "border-slate-200 text-slate-700" };

  return (
    <Tabs defaultValue="summary" className="space-y-6">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="captures">Captures</TabsTrigger>
        <TabsTrigger value="replay">Replay</TabsTrigger>
        <TabsTrigger value="console">Console</TabsTrigger>
        <TabsTrigger value="network">Network</TabsTrigger>
        <TabsTrigger value="session">Session</TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="space-y-6">
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("capitalize", liveBadge.className)}>{liveBadge.label}</Badge>
                {pollingEnabled && <Badge variant="outline">Auto-refresh every 5s</Badge>}
              </div>
              <p className="text-sm font-medium">
                {pollingEnabled
                  ? "This run is still active. Live console and network diagnostics will refresh automatically."
                  : "This run is no longer active. Diagnostics below reflect the latest persisted snapshot."}
              </p>
              <p className="text-xs text-muted-foreground">
                Last snapshot: {formatDate(liveState.snapshotAt ?? run.createdAt)}
                {liveSnapshot?.lastUsedAt ? ` · last browser activity ${formatDate(liveSnapshot.lastUsedAt)}` : ""}
              </p>
              {liveState.error && <p className="text-xs text-red-600">{liveState.error}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshLiveSnapshot()}>
              <RefreshCw className={cn("mr-2 h-4 w-4", liveState.state === "refreshing" && "animate-spin")} />
              Refresh now
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Primary evidence</CardTitle>
              <CardDescription>
                One place to review the main output from this browser session.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {primaryRecording ? (
                <video src={primaryRecording.videoUrl} controls className="w-full rounded-lg border bg-black" />
              ) : latestScreenshot?.publicUrl ? (
                <img
                  src={latestScreenshot.publicUrl}
                  alt={latestScreenshot.url}
                  className="w-full rounded-lg border"
                />
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                  No persisted primary evidence yet for this run.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run summary</CardTitle>
              <CardDescription>Operational metadata, diagnostics, and evidence tied back to this session.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Captures</span>
                <span className="font-medium">{screenshots.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Replay videos</span>
                <span className="font-medium">{recordings.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Final URL</span>
                <span className="font-medium text-right break-all">{effectiveFinalUrl ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Page title</span>
                <span className="font-medium text-right">{effectivePageTitle ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Started</span>
                <span className="font-medium text-right">{formatDate(effectiveStartedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium text-right">{formatDuration(effectiveStartedAt, effectiveEndedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Network health</span>
                <span className="font-medium text-right">{effectiveNetworkRequestCount} requests / {effectiveNetworkErrorCount} failed</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Console health</span>
                <span className="font-medium text-right">{effectiveConsoleErrorCount} errors / {effectiveConsoleWarningCount} warnings</span>
              </div>
              <div className="pt-2">
                <div className="flex flex-wrap gap-2">
                  <Link href="/dashboard/screenshots" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                    Open capture library
                  </Link>
                  <Link href="/dashboard/recordings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                    Open replay library
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
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
                <div className="space-y-3">
                  {recentConsoleLogs.slice(0, 6).map((entry, index) => (
                    <div key={`${entry.ts}-${index}`} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize",
                            (entry.level === "error" || entry.level === "exception") && "border-red-200 text-red-700",
                            entry.level === "warning" && "border-amber-200 text-amber-700",
                          )}
                        >
                          {entry.level}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatEventTime(entry.ts)}</span>
                      </div>
                      <pre className="whitespace-pre-wrap break-words text-xs font-mono text-foreground">{entry.text}</pre>
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
                <div className="space-y-3">
                  {recentFailedRequests.slice(0, 6).map((entry, index) => (
                    <div key={`${entry.url}-${entry.ts}-${index}`} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-red-200 text-red-700">{entry.status}</Badge>
                          <span className="text-sm font-medium">{entry.method}</span>
                          <span className="text-xs text-muted-foreground uppercase">{entry.resourceType}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{formatEventTime(entry.ts)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground break-all">{entry.url}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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

      <TabsContent value="captures" className="space-y-6">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {screenshots.map((shot) => (
                  <Card key={shot.id} className="overflow-hidden">
                    <div className="h-40 bg-muted overflow-hidden">
                      {shot.publicUrl ? (
                        <img src={shot.publicUrl} alt={shot.url} className="w-full h-full object-cover object-top" />
                      ) : (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Pending</div>
                      )}
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs text-muted-foreground truncate" title={shot.url}>{shot.url}</p>
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{shot.width}×{shot.height ?? "—"} · {shot.format.toUpperCase()}</span>
                        {shot.publicUrl && (
                          <a href={shot.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
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

      <TabsContent value="replay" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Replay</CardTitle>
            <CardDescription>Recorded video evidence for this run.</CardDescription>
          </CardHeader>
          <CardContent>
            {primaryRecording ? (
              <div className="space-y-4">
                <video src={primaryRecording.videoUrl} controls className="w-full rounded-lg border bg-black" />
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span>{primaryRecording.durationMs ? `${Math.floor(primaryRecording.durationMs / 1000)}s` : "—"}</span>
                  <span>{primaryRecording.viewportWidth ?? "—"}×{primaryRecording.viewportHeight ?? "—"}</span>
                  <a href={primaryRecording.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                    Open video <ExternalLink className="h-3.5 w-3.5" />
                  </a>
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

      <TabsContent value="console" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Console activity</CardTitle>
            <CardDescription>Search, filter, and review persisted or live console output for this run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
                <div className="grid grid-cols-[120px_180px_1fr] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground">
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
                            (entry.level === "error" || entry.level === "exception") && "border-red-200 text-red-700",
                            entry.level === "warning" && "border-amber-200 text-amber-700",
                          )}
                        >
                          {entry.level}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatEventTime(entry.ts)}</span>
                      <pre className="whitespace-pre-wrap break-words text-xs font-mono">{entry.text}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="network" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Network activity</CardTitle>
            <CardDescription>Search and filter request traffic for failed calls, resource classes, and URLs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
                    <div className="space-y-3 max-h-[640px] overflow-auto">
                      {effectiveNetworkErrors
                        .slice()
                        .sort((a, b) => b.ts - a.ts)
                        .map((entry, index) => (
                          <div key={`${entry.url}-${entry.ts}-${index}`} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <Badge variant="outline" className="border-red-200 text-red-700">{entry.status}</Badge>
                              <span className="text-xs text-muted-foreground">{formatEventTime(entry.ts)}</span>
                            </div>
                            <p className="text-sm font-medium">{entry.statusText}</p>
                            <p className="text-xs text-muted-foreground break-all">{entry.url}</p>
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
                      <div className="grid grid-cols-[90px_90px_90px_90px_90px_1fr] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground">
                        <span>Method</span>
                        <span>Status</span>
                        <span>Type</span>
                        <span>Duration</span>
                        <span>Size</span>
                        <span>URL</span>
                      </div>
                      <div className="max-h-[640px] overflow-auto divide-y">
                        {filteredRequests.map((entry, index) => (
                          <div key={`${entry.url}-${entry.ts}-${index}`} className="grid grid-cols-[90px_90px_90px_90px_90px_1fr] gap-3 px-4 py-3 text-xs">
                            <span className="font-medium">{entry.method}</span>
                            <span className={cn(entry.status >= 400 ? "text-red-600" : "text-foreground")}>{entry.status}</span>
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

      <TabsContent value="session" className="space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Session metadata</CardTitle>
              <CardDescription>Core run metadata captured for audit, debugging, and replay.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
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
            <CardContent className="space-y-3 text-sm">
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
