"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Globe, Image as ImageIcon, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBytes, formatDate, formatDuration, formatEventTime } from "../run-detail-utils";
import type {
  ConsoleEntry,
  LiveSnapshotResponse,
  NetworkRequestEntry,
  RecordingItem,
  RunDetails,
  RunOutcome,
  ScreenshotItem,
  TabValue,
} from "../run-detail-types";
import RunTimelineCarousel from "../run-timeline-carousel";

type LiveState = {
  state: "idle" | "refreshing" | "live" | "stale" | "error";
  snapshotAt: string | null;
  error: string | null;
};

type LiveBadge = { label: string; className: string };

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

type Props = {
  run: RunDetails;
  screenshots: ScreenshotItem[];
  recordings: RecordingItem[];
  primaryRecording: RecordingItem | null;
  latestScreenshot: ScreenshotItem | null;
  outcome: RunOutcome | null;
  pollingEnabled: boolean;
  liveSnapshot: LiveSnapshotResponse | null;
  liveState: LiveState;
  liveBadge: LiveBadge;
  onNavigate: (tab: TabValue) => void;
  outcomeLabel: string;
  outcomeClassName: string;
  outcomeMessage: string;
  attentionMessage: string;
  effectiveFinalUrl: string | null;
  effectiveStartedAt: string | null;
  effectiveEndedAt: string | null;
  effectivePageTitle: string | null;
  effectiveViewportWidth: number | null;
  effectiveViewportHeight: number | null;
  effectiveConsoleLogCount: number;
  effectiveConsoleErrorCount: number;
  effectiveConsoleWarningCount: number;
  effectiveNetworkRequestCount: number;
  effectiveNetworkErrorCount: number;
  hasPersistedEvidence: boolean;
  evidenceItemCount: number;
  totalIssueCount: number;
  recentConsoleLogs: ConsoleEntry[];
  recentFailedRequests: NetworkRequestEntry[];
};

export function SummaryTab({
  run,
  screenshots,
  recordings,
  primaryRecording,
  latestScreenshot,
  outcome,
  pollingEnabled,
  liveSnapshot,
  liveState,
  liveBadge,
  onNavigate,
  outcomeLabel,
  outcomeClassName,
  outcomeMessage,
  attentionMessage,
  effectiveFinalUrl,
  effectiveStartedAt,
  effectiveEndedAt,
  effectivePageTitle,
  effectiveViewportWidth,
  effectiveViewportHeight,
  effectiveConsoleLogCount,
  effectiveConsoleErrorCount,
  effectiveConsoleWarningCount,
  effectiveNetworkRequestCount,
  effectiveNetworkErrorCount,
  hasPersistedEvidence,
  evidenceItemCount,
  totalIssueCount,
  recentConsoleLogs,
  recentFailedRequests,
}: Props) {
  return (
    <>
      {(outcome?.problem || outcome?.summary) && (
        <Card>
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Problem</div>
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {outcome?.problem ?? (
                  <span className="text-muted-foreground italic">Agent did not record a problem statement.</span>
                )}
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
                {outcome?.summary ?? (
                  <span className="text-muted-foreground italic">Agent did not summarise this run.</span>
                )}
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
        <CardContent className="flex flex-col gap-2 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("capitalize", liveBadge.className)}>
              {liveState.state === "live" && (
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              )}
              {liveBadge.label}
            </Badge>
            {pollingEnabled && (
              <Badge variant="outline" className="border-primary/30 text-primary">
                Streaming
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium">
            {pollingEnabled
              ? "This run is still active. Console, network, and outcome updates stream in real time."
              : "This run is no longer active. Diagnostics below reflect the latest persisted snapshot."}
          </p>
          <p className="text-sm text-muted-foreground">
            Last snapshot: {formatDate(liveState.snapshotAt ?? run.createdAt)}
            {liveSnapshot?.lastUsedAt ? ` · last browser activity ${formatDate(liveSnapshot.lastUsedAt)}` : ""}
          </p>
          {liveState.error && <p className="text-sm text-destructive">{liveState.error}</p>}
        </CardContent>
      </Card>

      <Card
        className={cn(
          "border",
          run.status === "failed" || totalIssueCount > 0 || (!hasPersistedEvidence && !pollingEnabled) || (run.recordingEnabled && !primaryRecording && !pollingEnabled)
            ? "border-destructive/20 bg-destructive/5"
            : "border-border bg-muted/30",
        )}
      >
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
              <Button type="button" variant="outline" size="sm" onClick={() => onNavigate("console")}>
                Review console
              </Button>
            )}
            {effectiveNetworkErrorCount > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => onNavigate("network")}>
                Review network
              </Button>
            )}
            {screenshots.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => onNavigate("captures")}>
                Open captures
              </Button>
            )}
            {recordings.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => onNavigate("replay")}>
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
            <CardDescription>One place to review the main output from this browser session.</CardDescription>
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
                <p className="text-sm text-muted-foreground break-all">
                  {effectiveFinalUrl ?? run.startUrl ?? "Managed browser session"}
                </p>
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
                  onClick={() => onNavigate("console")}
                  header="Console findings"
                  value={effectiveConsoleErrorCount}
                  description={`${effectiveConsoleWarningCount} warnings recorded`}
                />
                <MetricActionButton
                  onClick={() => onNavigate("network")}
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
                        <p key={`${action}-${index}`} className="text-sm text-muted-foreground">
                          {index + 1}. {action}
                        </p>
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
                  onClick={() => onNavigate("captures")}
                  header={
                    <span className="inline-flex items-center gap-2">
                      <ImageIcon className="size-4" />Captures
                    </span>
                  }
                  value={screenshots.length}
                  description="Persisted screenshots for this run"
                />
                <MetricActionButton
                  onClick={() => onNavigate("replay")}
                  header={
                    <span className="inline-flex items-center gap-2">
                      <Video className="size-4" />Replays
                    </span>
                  }
                  value={recordings.length}
                  description="Saved recording outputs"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Viewport</span>
                  <span className="font-medium text-right">
                    {effectiveViewportWidth ?? "—"}×{effectiveViewportHeight ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Diagnostics</span>
                  <span className="font-medium text-right">
                    {effectiveConsoleLogCount} console events · {effectiveNetworkRequestCount} requests
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Evidence readiness</span>
                  <span className="font-medium text-right">
                    {hasPersistedEvidence
                      ? `${evidenceItemCount} items saved`
                      : pollingEnabled
                      ? "Awaiting persisted evidence"
                      : "No evidence saved"}
                  </span>
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
    </>
  );
}
