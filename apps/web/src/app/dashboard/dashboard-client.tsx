"use client";

import Link from "next/link";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Camera, Download, ArrowRight, Video, ExternalLink, Globe, Image as ImageIcon, AlertTriangle, Activity, Clock3, Monitor, Network, SquareTerminal } from "lucide-react";
import { PLAN_LIMITS } from "@screenshotsmcp/types";
import { InstallDialog } from "@/components/install-dialog";

interface DashboardData {
  usage: number;
  limit: number;
  keyCount: number;
  recordingCount: number;
  activeRunCount: number;
  failedRunCount: number;
  issueRunCount: number;
  sharedRunCount: number;
  plan: "free" | "starter" | "pro";
  apiUrl: string;
  recentRuns: {
    id: string;
    status: string;
    executionMode: string;
    startUrl: string | null;
    finalUrl: string | null;
    pageTitle: string | null;
    shareToken: string | null;
    sharedAt: string | null;
    viewportWidth: number | null;
    viewportHeight: number | null;
    consoleErrorCount: number;
    consoleWarningCount: number;
    networkErrorCount: number;
    captureCount: number;
    replayCount: number;
    startedAt: string;
    endedAt: string | null;
  }[];
  recentScreenshots: {
    id: string;
    sessionId: string | null;
    url: string;
    status: string;
    publicUrl: string | null;
    width: number;
    height: number | null;
    format: string;
    fullPage: boolean;
    createdAt: string;
  }[];
  recentRecordings: {
    id: string;
    sessionId: string;
    pageUrl: string | null;
    durationMs: number | null;
    viewportWidth: number | null;
    viewportHeight: number | null;
    createdAt: string;
  }[];
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function formatRunDuration(startedAt: string, endedAt: string | null) {
  if (!endedAt) return "In progress";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms <= 0) return "—";
  return formatDuration(ms);
}

function hostname(input?: string | null) {
  if (!input) return "Managed browser run";
  try {
    return new URL(input).hostname;
  } catch {
    return input;
  }
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  
  const { usage, limit, keyCount, recordingCount, activeRunCount, failedRunCount, issueRunCount, sharedRunCount, plan, apiUrl, recentRuns, recentScreenshots, recentRecordings } = data;
  const isUnlimited = limit >= 999999;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((usage / limit) * 100));

  return (
    <>
      <div className="flex flex-col gap-8 px-4 py-6 sm:px-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Overview</h1>
            <p className="text-muted-foreground">Recent runs, issues that need attention, and the evidence your browser workflows produced.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard/runs" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Open runs
            </Link>
            <Badge variant="secondary" className="capitalize">{plan} plan</Badge>
          </div>
        </div>

        {keyCount === 0 && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="pt-5 pb-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Download className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Connect ScreenshotsMCP to your workflow</p>
                    <p className="text-sm text-muted-foreground">Create an API key, connect MCP, and start collecting screenshots, recordings, and proof from real browser runs.</p>
                  </div>
                </div>
                <Button 
                  className="gap-2 sm:self-start lg:self-auto"
                  onClick={() => setShowInstallDialog(true)}
                >
                  Install now <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Runs with issues</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{issueRunCount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Runs with console or network failures surfaced in reporting</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active runs</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeRunCount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Runs currently in progress or awaiting completion</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Screenshots this month</CardTitle>
              <Camera className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usage.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">of {isUnlimited ? "unlimited" : limit.toLocaleString()} included</p>
              {!isUnlimited && (
                <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Recordings this month</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recordingCount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Saved session videos and replayable evidence</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Shared runs</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sharedRunCount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Runs currently exposed through a public review link</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)] gap-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Recent runs</CardTitle>
                <CardDescription>The main review path: what ran recently, what evidence exists, and which sessions need attention.</CardDescription>
              </div>
              <Link href="/dashboard/runs" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Open all
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {recentRuns.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No runs yet. Start a browser workflow and your recent sessions will show up here with their evidence and issues.
                </div>
              ) : (
                recentRuns.map((item) => {
                  const issueCount = item.consoleErrorCount + item.networkErrorCount;
                  const targetUrl = item.finalUrl ?? item.startUrl ?? "Managed browser session";
                  const title = item.pageTitle ?? hostname(targetUrl);
                  const sharedHref = item.shareToken ? `/shared/runs/${encodeURIComponent(item.shareToken)}` : null;

                  return (
                    <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-accent/30">
                      <Link href={`/dashboard/runs/${item.id}`} className="block">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium truncate" title={title}>{title}</p>
                              <Badge variant={item.status === "completed" ? "secondary" : item.status === "failed" ? "destructive" : "outline"} className="capitalize">{item.status}</Badge>
                              <Badge variant="outline" className="capitalize">{item.executionMode}</Badge>
                              {item.shareToken && <Badge variant="secondary">Shared</Badge>}
                              {issueCount > 0 && <Badge variant="destructive">{issueCount} issues</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground truncate" title={targetUrl}>{targetUrl}</p>
                            {item.shareToken && (
                              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                                <Globe className="h-3.5 w-3.5" />
                                Public review enabled{item.sharedAt ? ` · updated ${timeAgo(item.sharedAt)}` : ""}
                              </p>
                            )}
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{timeAgo(item.startedAt)}</span>
                          <span>{formatRunDuration(item.startedAt, item.endedAt)}</span>
                          <span className="inline-flex items-center gap-1.5"><Monitor className="h-3.5 w-3.5" />{item.viewportWidth ?? "—"}×{item.viewportHeight ?? "—"}</span>
                          <span className="inline-flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />{item.captureCount} captures</span>
                          <span className="inline-flex items-center gap-1.5"><Video className="h-3.5 w-3.5" />{item.replayCount} replays</span>
                          <span className="inline-flex items-center gap-1.5"><Network className="h-3.5 w-3.5" />{item.networkErrorCount} network failures</span>
                          <span className="inline-flex items-center gap-1.5"><SquareTerminal className="h-3.5 w-3.5" />{item.consoleErrorCount} console errors</span>
                        </div>
                      </Link>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/dashboard/runs/${item.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                          Open run
                        </Link>
                        {sharedHref && (
                          <Link href={sharedHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Open shared
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Needs attention</CardTitle>
                <CardDescription>Bring failures and noisy runs to the top so you know what to review next.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Failed runs</p>
                    <p className="mt-1 text-2xl font-semibold">{failedRunCount}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Runs with issues</p>
                    <p className="mt-1 text-2xl font-semibold">{issueRunCount}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {failedRunCount > 0 || issueRunCount > 0
                    ? "Open the Runs view to review failures, console errors, and network problems in one workflow."
                    : "Your recent runs are not showing failed or issue-marked sessions right now."}
                </div>
                <Link href="/dashboard/runs" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                  Review runs
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Next actions</CardTitle>
                <CardDescription>Keep the most useful next steps visible instead of burying them behind artifact pages.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex flex-col gap-1 rounded-lg border p-4">
                  <p className="font-medium">{keyCount === 0 ? "Finish install" : "Run and review a session"}</p>
                  <p className="text-muted-foreground">
                    {keyCount === 0
                      ? "Create your first API key and connect ScreenshotsMCP inside your IDE."
                      : "Open the Runs view to review recent sessions before diving into raw artifacts."}
                  </p>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border p-4">
                  <p className="font-medium">Plan status</p>
                  <p className="text-muted-foreground capitalize">
                    {plan} plan · {PLAN_LIMITS[plan].price === 0 ? "Free forever" : `$${PLAN_LIMITS[plan].price}/mo`}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button onClick={() => setShowInstallDialog(true)} className="gap-2">
                    Open install guide <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Link href="/dashboard/runs" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                    Open unified runs workspace
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Recent screenshots</CardTitle>
                <CardDescription>Artifact library view for recent captures, with direct links back to the parent run when available.</CardDescription>
              </div>
              <Link href="/dashboard/screenshots" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Open captures
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {recentScreenshots.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No screenshots yet. Run a browser task and your recent evidence will show up here.
                </div>
              ) : (
                recentScreenshots.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div className="min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium truncate" title={item.url}>{item.url}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={item.status === "done" ? "secondary" : "outline"} className="capitalize">{item.status}</Badge>
                        <span>{item.width}×{item.height ?? "—"}</span>
                        <span>{item.format.toUpperCase()}</span>
                        {item.fullPage && <span>Full page</span>}
                        <span>{timeAgo(item.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {item.sessionId && (
                        <Link href={`/dashboard/runs/${item.sessionId}`} className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}>
                          View run
                        </Link>
                      )}
                      {item.publicUrl && (
                        <Link href={item.publicUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Recent recordings</CardTitle>
                <CardDescription>Replay library view for recent recordings, with the run detail page as the main review destination.</CardDescription>
              </div>
              <Link href="/dashboard/recordings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Open replays
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {recentRecordings.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No recordings yet. Start a managed browser run with recording enabled to build replayable evidence.
                </div>
              ) : (
                recentRecordings.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div className="min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium truncate" title={item.pageUrl ?? "Managed browser session"}>{item.pageUrl ?? "Managed browser session"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDuration(item.durationMs)}</span>
                        <span>{item.viewportWidth ?? "—"}×{item.viewportHeight ?? "—"}</span>
                        <span>{timeAgo(item.createdAt)}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Link href={`/dashboard/runs/${item.sessionId}`} className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}>
                        View run
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How to get better proof</CardTitle>
            <CardDescription>
              Use your API key through REST or MCP, then escalate from captures to richer evidence when needed.{" "}
              <Button type="button" variant="link" size="sm" className="h-auto px-0 py-0 align-baseline" onClick={() => setShowInstallDialog(true)}>
                Need help installing? →
              </Button>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium mb-2">Sync REST API (returns capture output directly)</p>
              <pre className="rounded-md bg-muted p-4 text-sm overflow-x-auto">
                <code>{`curl -X POST "${apiUrl}/v1/screenshot?sync=true" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'`}</code>
              </pre>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">MCP config (Cursor / Windsurf / Claude)</p>
              <pre className="rounded-md bg-muted p-4 text-sm overflow-x-auto">
                <code>{`{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "${apiUrl}/mcp",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}`}</code>
              </pre>
            </div>
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Start with public remote workflows for fast inspection. When the work needs localhost access, private auth, recordings, or stronger verification, use the managed local browser and export evidence bundles.
            </div>
          </CardContent>
        </Card>
      </div>

      <InstallDialog 
        isOpen={showInstallDialog} 
        onClose={() => setShowInstallDialog(false)} 
      />
    </>
  );
}
