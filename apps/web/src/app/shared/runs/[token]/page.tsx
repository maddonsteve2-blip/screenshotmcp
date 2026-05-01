import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Camera, CheckCircle2, Clock, ExternalLink, Globe, Monitor, Network, PlayCircle, SquareTerminal } from "lucide-react";
import { SharedRunLiveRefresh } from "./shared-run-live-refresh";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app";

type SharedRun = {
  id: string;
  status: string;
  executionMode: string;
  startUrl: string | null;
  finalUrl: string | null;
  pageTitle: string | null;
  recordingEnabled: boolean;
  viewportWidth: number | null;
  viewportHeight: number | null;
  consoleLogCount: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  networkRequestCount: number;
  networkErrorCount: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string | null;
  sharedAt: string | null;
};

type SharedScreenshot = {
  id: string;
  url: string;
  status: string;
  publicUrl: string | null;
  width: number;
  height: number | null;
  format: string;
  fullPage: boolean;
  createdAt: string | null;
};

type SharedRecording = {
  id: string;
  sessionId: string;
  pageUrl: string | null;
  fileSize: number | null;
  durationMs: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  createdAt: string | null;
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

type SharedRunResponse = {
  run: SharedRun;
  outcome: {
    taskType: string | null;
    userGoal: string | null;
    workflowUsed: string | null;
    verdict: string;
    summary: string | null;
    findings: Array<{ id?: string; title?: string; detail?: string; recommendation?: string }>;
    nextActions: string[];
  } | null;
  screenshots: SharedScreenshot[];
  recordings: SharedRecording[];
  consoleLogs: ConsoleEntry[];
  networkErrors: NetworkErrorEntry[];
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
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

function prettyHost(input?: string | null) {
  if (!input) return "Shared browser run";
  try {
    return new URL(input).hostname;
  } catch {
    return input;
  }
}

async function getSharedRun(token: string): Promise<SharedRunResponse | null> {
  const res = await fetch(`${API_URL}/v1/runs/shared/${encodeURIComponent(token)}`, {
    cache: "no-store",
  }).catch(() => null);

  if (!res || res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load shared run");
  return res.json();
}

export default async function SharedRunPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getSharedRun(token);

  if (!data) {
    notFound();
  }

  const { run, outcome, screenshots, recordings, consoleLogs, networkErrors } = data;
  const primaryRecording = recordings[0] ?? null;
  const primaryScreenshot = screenshots[screenshots.length - 1] ?? null;
  const issueCount = run.consoleErrorCount + run.networkErrorCount;
  const outcomeClassName = run.status === "active"
    ? "border-primary/30 text-primary"
    : outcome?.verdict === "failed"
    ? "border-red-200 text-red-700"
    : outcome?.verdict === "inconclusive"
      ? "border-amber-200 text-amber-700"
      : outcome?.verdict === "needs_review"
        ? "border-amber-200 text-amber-700"
        : run.status === "failed"
    ? "border-red-200 text-red-700"
    : issueCount > 0
      ? "border-amber-200 text-amber-700"
      : "border-emerald-200 text-emerald-700";
  const outcomeLabel = run.status === "active"
    ? "Active"
    : outcome?.verdict
    ? outcome.verdict.replace(/_/g, " ")
    : run.status === "failed"
    ? "Failed"
    : issueCount > 0
      ? "Needs review"
      : "Healthy";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-col gap-4 border-b pb-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={outcomeClassName}>{outcomeLabel}</Badge>
              <Badge variant="outline" className="capitalize">{run.executionMode}</Badge>
              {outcome?.workflowUsed && <Badge variant="outline">{outcome.workflowUsed}</Badge>}
              {run.recordingEnabled && <Badge variant="outline">Recording enabled</Badge>}
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{run.pageTitle || prettyHost(run.startUrl)}</h1>
              <p className="break-all text-[1.05rem] text-muted-foreground sm:text-[1.12rem]">{run.finalUrl ?? run.startUrl ?? "Shared browser run"}</p>
              {outcome?.userGoal && <p className="text-base text-muted-foreground">Goal: {outcome.userGoal}</p>}
              <p className="font-mono text-base text-muted-foreground">Run ID: {run.id}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 text-base text-muted-foreground lg:items-end">
            <div className="flex items-center gap-3">
              <SharedRunLiveRefresh shareToken={token} />
              <p>Shared {formatDate(run.sharedAt)}</p>
            </div>
            <Link href="/" className="inline-flex items-center gap-2 text-foreground hover:text-primary">
              Open DeepSyte
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <Card className={issueCount > 0 || run.status === "failed" ? "border-amber-200 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/40"}>
          <CardContent className="flex flex-col gap-3 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {issueCount > 0 || run.status === "failed" ? (
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                )}
                <p className="text-base font-medium">Shared review summary</p>
              </div>
              <p className="text-[1.02rem] leading-relaxed text-muted-foreground">
                {outcome?.summary
                  ? outcome.summary
                  : run.status === "failed"
                  ? "This run failed before completion and should be treated as an unsuccessful proof run."
                  : issueCount > 0
                    ? `This run completed with ${issueCount} high-priority diagnostic issue${issueCount === 1 ? "" : "s"} across console and network signals.`
                    : "This run completed with no persisted high-priority console or network failures."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-base text-muted-foreground">
              <span>{screenshots.length} captures</span>
              <span>{recordings.length} replays</span>
              <span>{run.networkRequestCount} requests</span>
            </div>
          </CardContent>
        </Card>

        {outcome && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top findings</CardTitle>
                <CardDescription>Why this outcome was classified the way it was.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
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
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Next actions</CardTitle>
                <CardDescription>Smallest concrete follow-ups for this run.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {outcome.nextActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No follow-up actions were saved for this run.</p>
                ) : (
                  outcome.nextActions.slice(0, 4).map((action, index) => (
                    <p key={`${action}-${index}`} className="text-sm text-muted-foreground">{index + 1}. {action}</p>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">Started</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-base font-medium leading-relaxed">{formatDate(run.startedAt)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">Duration</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-base font-medium leading-relaxed">{formatDuration(run.startedAt, run.endedAt)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">Viewport</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-base font-medium leading-relaxed">{run.viewportWidth ?? "—"}×{run.viewportHeight ?? "—"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">Evidence</CardTitle>
              <Camera className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-base font-medium leading-relaxed">{screenshots.length} captures · {recordings.length} replays</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">Network</CardTitle>
              <Network className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-base font-medium leading-relaxed">{run.networkErrorCount} failed of {run.networkRequestCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">Console</CardTitle>
              <SquareTerminal className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-base font-medium leading-relaxed">{run.consoleErrorCount} errors · {run.consoleWarningCount} warnings</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Primary evidence</CardTitle>
              <CardDescription>Review the main replay or latest persisted screenshot for this run.</CardDescription>
            </CardHeader>
            <CardContent>
              {primaryRecording ? (
                <div className="space-y-4">
                  <video src={primaryRecording.videoUrl} controls className="aspect-video w-full rounded-lg border bg-black shadow-sm" />
                  <div className="flex flex-wrap gap-4 text-base text-muted-foreground">
                    <span>{primaryRecording.durationMs ? `${Math.floor(primaryRecording.durationMs / 1000)}s` : "—"}</span>
                    <span>{primaryRecording.viewportWidth ?? "—"}×{primaryRecording.viewportHeight ?? "—"}</span>
                    <span>{formatBytes(primaryRecording.fileSize)}</span>
                  </div>
                </div>
              ) : primaryScreenshot?.publicUrl ? (
                <div className="space-y-4">
                  <div className="relative h-[72vh] max-h-[72vh] w-full overflow-hidden rounded-lg border bg-muted">
                    <Image
                      src={primaryScreenshot.publicUrl}
                      alt={primaryScreenshot.url}
                      fill
                      unoptimized
                      sizes="(min-width: 1536px) 50rem, (min-width: 1024px) 60vw, 100vw"
                      className="object-contain"
                    />
                  </div>
                  <a href={primaryScreenshot.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-base text-foreground hover:text-primary">
                    Open screenshot
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-base text-muted-foreground">
                  No persisted evidence is available on this shared run.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Run context</CardTitle>
                <CardDescription>Core metadata preserved with the shared review.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-base">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Start URL</span>
                  <span className="max-w-[60%] break-all text-right font-medium">{run.startUrl ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Final URL</span>
                  <span className="max-w-[60%] break-all text-right font-medium">{run.finalUrl ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Page title</span>
                  <span className="max-w-[60%] text-right font-medium">{run.pageTitle ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Execution mode</span>
                  <span className="font-medium capitalize">{run.executionMode}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Evidence coverage</CardTitle>
                <CardDescription>Persisted proof assets included in this shared URL.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-base">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Captures</span>
                  <span className="font-medium">{screenshots.length}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Replays</span>
                  <span className="font-medium">{recordings.length}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Recording enabled</span>
                  <span className="font-medium">{run.recordingEnabled ? "Yes" : "No"}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {recordings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Replay outputs</CardTitle>
              <CardDescription>All replay videos preserved for this shared run.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recordings.map((recording) => (
                <div key={recording.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <PlayCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-base font-medium">Replay</span>
                    </div>
                    <span className="text-base text-muted-foreground">{formatDate(recording.createdAt)}</span>
                  </div>
                  <video src={recording.videoUrl} controls className="aspect-video w-full rounded-lg border bg-black shadow-sm" />
                  <div className="flex flex-wrap gap-4 text-base text-muted-foreground">
                    <span>{recording.durationMs ? `${Math.floor(recording.durationMs / 1000)}s` : "—"}</span>
                    <span>{recording.viewportWidth ?? "—"}×{recording.viewportHeight ?? "—"}</span>
                    <span>{formatBytes(recording.fileSize)}</span>
                    {recording.pageUrl && <span className="break-all">{recording.pageUrl}</span>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {screenshots.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Captured screenshots</CardTitle>
              <CardDescription>Persisted capture evidence included in the shared run.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {screenshots.map((shot) => (
                  <div key={shot.id} className="overflow-hidden rounded-lg border">
                    {shot.publicUrl ? (
                      <div className="relative h-56 w-full md:h-64">
                        <Image src={shot.publicUrl} alt={shot.url} fill unoptimized sizes="(min-width: 1280px) 50vw, 100vw" className="object-cover object-top" />
                      </div>
                    ) : (
                      <div className="h-56 w-full bg-muted md:h-64" />
                    )}
                    <div className="space-y-2 p-4">
                      <p className="truncate text-base font-medium" title={shot.url}>{shot.url}</p>
                      <div className="flex flex-wrap gap-3 text-base text-muted-foreground">
                        <span>{shot.width}×{shot.height ?? "—"}</span>
                        <span>{shot.format.toUpperCase()}</span>
                        <span>{shot.fullPage ? "Full page" : "Viewport"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-base text-muted-foreground">
                        <span>{formatDate(shot.createdAt)}</span>
                        {shot.publicUrl && (
                          <a href={shot.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                            Open <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent console signals</CardTitle>
              <CardDescription>Latest persisted console events captured in the shared run.</CardDescription>
            </CardHeader>
            <CardContent>
              {consoleLogs.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-base text-muted-foreground">
                  No console signals were persisted for this run.
                </div>
              ) : (
                <div className="space-y-3">
                  {consoleLogs.slice(0, 8).map((entry, index) => (
                    <div key={`${entry.ts}-${index}`} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Badge
                          variant="outline"
                          className={entry.level === "error" || entry.level === "exception" ? "border-red-200 text-red-700" : entry.level === "warning" ? "border-amber-200 text-amber-700" : ""}
                        >
                          {entry.level}
                        </Badge>
                        <span className="text-base text-muted-foreground">{formatDate(new Date(entry.ts).toISOString())}</span>
                      </div>
                      <pre className="whitespace-pre-wrap break-words text-[0.96rem] leading-7 font-mono sm:text-base">{entry.text}</pre>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent network failures</CardTitle>
              <CardDescription>Latest failed requests preserved in the shared review.</CardDescription>
            </CardHeader>
            <CardContent>
              {networkErrors.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-base text-muted-foreground">
                  No failed requests were persisted for this run.
                </div>
              ) : (
                <div className="space-y-3">
                  {networkErrors.slice(0, 8).map((entry, index) => (
                    <div key={`${entry.url}-${entry.ts}-${index}`} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-red-200 text-red-700">{entry.status}</Badge>
                          <span className="text-base font-medium">{entry.statusText}</span>
                        </div>
                        <span className="text-base text-muted-foreground">{formatDate(new Date(entry.ts).toISOString())}</span>
                      </div>
                      <div className="flex items-start gap-2 text-base text-muted-foreground">
                        <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="break-all">{entry.url}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
