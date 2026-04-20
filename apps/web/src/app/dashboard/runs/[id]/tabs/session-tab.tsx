"use client";

import { Activity, AlertTriangle, Globe, Image as ImageIcon, Monitor, Network, SquareTerminal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "../run-detail-utils";
import type { LiveSnapshotResponse, RunDetails } from "../run-detail-types";

type Props = {
  run: RunDetails;
  liveSnapshot: LiveSnapshotResponse | null;
  liveSnapshotAt: string | null;
  effectiveFinalUrl: string | null;
  effectivePageTitle: string | null;
  effectiveViewportWidth: number | null;
  effectiveViewportHeight: number | null;
  effectiveStartedAt: string | null;
  effectiveConsoleLogCount: number;
  effectiveConsoleErrorCount: number;
  effectiveConsoleWarningCount: number;
  effectiveNetworkRequestCount: number;
  effectiveNetworkErrorCount: number;
  screenshotCount: number;
  recordingCount: number;
};

export function SessionTab({
  run,
  liveSnapshot,
  liveSnapshotAt,
  effectiveFinalUrl,
  effectivePageTitle,
  effectiveViewportWidth,
  effectiveViewportHeight,
  effectiveStartedAt,
  effectiveConsoleLogCount,
  effectiveConsoleErrorCount,
  effectiveConsoleWarningCount,
  effectiveNetworkRequestCount,
  effectiveNetworkErrorCount,
  screenshotCount,
  recordingCount,
}: Props) {
  return (
    <>
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
              <span className="font-medium text-right">{formatDate(liveSnapshot?.lastUsedAt ?? liveSnapshotAt)}</span>
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
            {screenshotCount} captures and {recordingCount} replay artifacts are linked to this run.
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
            Last diagnostics snapshot: {formatDate(liveSnapshotAt ?? run.createdAt)}.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
