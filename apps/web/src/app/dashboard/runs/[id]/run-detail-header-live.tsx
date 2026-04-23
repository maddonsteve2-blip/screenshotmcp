"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Globe, Image as ImageIcon, Monitor, Network, SquareTerminal } from "lucide-react";
import { useDashboardWs } from "@/lib/use-dashboard-ws";
import type { LiveSnapshotResponse } from "./run-detail-types";

type Props = {
  runId: string;
  initialStatus: string;
  executionMode: string;
  recordingEnabled: boolean;
  startedAt: string | null;
  endedAt: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  shareToken: string | null;
  sharedAt: string | null;
  initialCaptureCount: number;
  initialRecordingCount: number;
  initialConsoleLogCount: number;
  initialConsoleErrorCount: number;
  initialNetworkRequestCount: number;
  initialNetworkErrorCount: number;
};

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function formatDurationLive(startedAt: string | null, endedAt: string | null, now: number): string {
  if (!startedAt) return "—";
  const end = endedAt ? new Date(endedAt).getTime() : now;
  const ms = end - new Date(startedAt).getTime();
  if (ms <= 0) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s${!endedAt ? " (live)" : ""}`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s${!endedAt ? " (live)" : ""}`;
}

export function RunDetailHeaderLive(props: Props) {
  const [live, setLive] = useState<LiveSnapshotResponse | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  const onMessage = useCallback((message: { type: string; data?: LiveSnapshotResponse }) => {
    if (message.type !== "run-live" || !message.data) return;
    setLive(message.data);
  }, []);

  useDashboardWs<LiveSnapshotResponse>({
    subscription: { channel: "run-live", runId: props.runId },
    onMessage,
  });

  const status = live?.status ?? props.initialStatus;

  // Tick every second while the run is still active so the duration card stays live.
  useEffect(() => {
    if (status !== "active") return;
    const t = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [status]);

  const endedAt = live?.endedAt ?? props.endedAt;
  const captureCount = live?.captureCount ?? props.initialCaptureCount;
  const recordingCount = live?.recordingCount ?? props.initialRecordingCount;
  const consoleCount = live?.consoleLogCount ?? props.initialConsoleLogCount;
  const consoleErrors = live?.consoleErrorCount ?? props.initialConsoleErrorCount;
  const netReq = live?.networkRequestCount ?? props.initialNetworkRequestCount;
  const netErr = live?.networkErrorCount ?? props.initialNetworkErrorCount;
  const shareToken = live?.shareToken ?? props.shareToken;
  const sharedAt = live?.sharedAt ?? props.sharedAt;
  const viewportWidth = live?.viewport?.width ?? props.viewportWidth;
  const viewportHeight = live?.viewport?.height ?? props.viewportHeight;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={status === "completed" ? "secondary" : "outline"}
          className={`capitalize ${status === "active" ? "border-primary/30 text-primary" : status === "failed" ? "border-destructive/30 text-destructive" : ""}`}
        >
          {status === "active" ? (
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          ) : null}
          {status}
        </Badge>
        <Badge variant="outline" className="capitalize">
          {props.executionMode}
        </Badge>
        {props.recordingEnabled && <Badge variant="outline">Recording enabled</Badge>}
        {shareToken && (
          <Badge variant="outline" className="border-emerald-200 text-emerald-700">
            Shared
          </Badge>
        )}
      </div>
      {shareToken && (
        <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          Public review enabled{sharedAt ? ` · updated ${formatDate(sharedAt)}` : ""}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-6 mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Started</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{formatDate(props.startedAt)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{formatDurationLive(props.startedAt, endedAt, tick)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Viewport</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {viewportWidth ?? "—"}×{viewportHeight ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Evidence</CardTitle>
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {captureCount} captures · {recordingCount} replays
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Requests</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {netReq} total · {netErr} failed
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Console</CardTitle>
            <SquareTerminal className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {consoleCount} events · {consoleErrors} errors
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sharing</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{shareToken ? "Public review enabled" : "Private"}</div>
            <div className="text-xs text-muted-foreground">
              {shareToken && sharedAt
                ? `Updated ${formatDate(sharedAt)}`
                : "Only invited reviewers can access via share link."}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
