"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, Clock, ExternalLink, Globe, Image as ImageIcon, Monitor, Network, Search, SquareTerminal, Video } from "lucide-react";

type RunListItem = {
  outcome: {
    verdict: string;
    summary: string | null;
    userGoal: string | null;
    workflowUsed: string | null;
  } | null;
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
  startedAt: string;
  endedAt: string | null;
  captureCount: number;
  replayCount: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  networkErrorCount: number;
  networkRequestCount: number;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(startedAt: string, endedAt?: string | null) {
  if (!endedAt) return "In progress";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms <= 0) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function hostname(input?: string | null) {
  if (!input) return "Managed browser run";
  try {
    return new URL(input).hostname;
  } catch {
    return input;
  }
}

export default function RunsListClient({ runs }: { runs: RunListItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "failed">("all");
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [evidenceFilter, setEvidenceFilter] = useState<"all" | "has-evidence" | "captures" | "replays" | "issues">("all");
  const [shareFilter, setShareFilter] = useState<"all" | "shared" | "private">("all");

  const modeOptions = useMemo(
    () => ["all", ...Array.from(new Set(runs.map((run) => run.executionMode).filter(Boolean))).sort()],
    [runs],
  );

  const filteredRuns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return runs.filter((run) => {
      const statusMatch = statusFilter === "all" || run.status === statusFilter;
      const modeMatch = modeFilter === "all" || run.executionMode === modeFilter;
      const shareMatch = shareFilter === "all"
        || (shareFilter === "shared" ? Boolean(run.shareToken) : !run.shareToken);
      const evidenceMatch = (() => {
        if (evidenceFilter === "all") return true;
        if (evidenceFilter === "has-evidence") return run.captureCount > 0 || run.replayCount > 0;
        if (evidenceFilter === "captures") return run.captureCount > 0;
        if (evidenceFilter === "replays") return run.replayCount > 0;
        return run.consoleErrorCount > 0 || run.networkErrorCount > 0;
      })();
      const queryMatch = !normalizedQuery || [
        run.id,
        run.pageTitle,
        run.finalUrl,
        run.startUrl,
        run.executionMode,
        run.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);

      return statusMatch && modeMatch && shareMatch && evidenceMatch && queryMatch;
    });
  }, [evidenceFilter, modeFilter, query, runs, shareFilter, statusFilter]);

  const counts = useMemo(() => ({
    active: runs.filter((run) => run.status === "active").length,
    failed: runs.filter((run) => run.status === "failed").length,
    withEvidence: runs.filter((run) => run.captureCount > 0 || run.replayCount > 0).length,
    withIssues: runs.filter((run) => run.consoleErrorCount > 0 || run.networkErrorCount > 0).length,
    shared: runs.filter((run) => Boolean(run.shareToken)).length,
  }), [runs]);

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Video className="h-10 w-10 text-muted-foreground/30" />
          <p className="font-medium">No runs yet</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Start an interactive browser workflow and your runs will appear here with their screenshots and replay evidence.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-xs text-muted-foreground">Active runs</p>
            <p className="text-2xl font-semibold">{counts.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-xs text-muted-foreground">Failed runs</p>
            <p className="text-2xl font-semibold">{counts.failed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-xs text-muted-foreground">Runs with evidence</p>
            <p className="text-2xl font-semibold">{counts.withEvidence}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-xs text-muted-foreground">Runs with issues</p>
            <p className="text-2xl font-semibold">{counts.withIssues}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-xs text-muted-foreground">Shared runs</p>
            <p className="text-2xl font-semibold">{counts.shared}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter runs</CardTitle>
          <CardDescription>
            Scan by status, execution mode, and evidence coverage without opening every session.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative w-full xl:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by URL, title, status, or run ID"
              className="pl-9"
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {(["all", "active", "completed", "failed"] as const).map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={statusFilter === status ? "default" : "outline"}
                  onClick={() => setStatusFilter(status)}
                  className="capitalize"
                >
                  {status}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {modeOptions.map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={modeFilter === mode ? "default" : "outline"}
                  onClick={() => setModeFilter(mode)}
                  className="capitalize"
                >
                  {mode === "all" ? "All modes" : mode}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                ["all", "All runs"],
                ["has-evidence", "Any evidence"],
                ["captures", "Captures"],
                ["replays", "Replays"],
                ["issues", "Issues"],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={evidenceFilter === value ? "default" : "outline"}
                  onClick={() => setEvidenceFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                ["all", "All sharing"],
                ["shared", "Shared"],
                ["private", "Private"],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={shareFilter === value ? "default" : "outline"}
                  onClick={() => setShareFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {filteredRuns.length} of {runs.length} runs.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {filteredRuns.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No runs match the current filters.
            </CardContent>
          </Card>
        ) : (
          filteredRuns.map((run) => {
            const issueCount = run.consoleErrorCount + run.networkErrorCount;
            const title = run.pageTitle || hostname(run.finalUrl ?? run.startUrl);
            const targetUrl = run.finalUrl ?? run.startUrl ?? "Managed browser session";
            const sharedHref = run.shareToken ? `/shared/runs/${encodeURIComponent(run.shareToken)}` : null;
            const verdictLabel = run.outcome?.verdict ? run.outcome.verdict.replace(/_/g, " ") : run.status;
            const verdictVariant = run.outcome?.verdict === "failed"
              ? "destructive"
              : run.outcome?.verdict === "passed"
                ? "secondary"
                : "outline";
            const summaryText = run.outcome?.summary
              || (issueCount > 0
                ? `Completed with ${issueCount} diagnostic issue${issueCount === 1 ? "" : "s"}.`
                : run.status === "failed"
                  ? "Run failed before completion."
                  : "No high-priority persisted issues recorded.");

            return (
              <Card key={run.id} className="transition-colors hover:border-primary/40 hover:bg-accent/20">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{title}</CardTitle>
                        <Badge
                          variant={verdictVariant}
                          className="capitalize"
                        >
                          {verdictLabel}
                        </Badge>
                        <Badge variant="outline" className="capitalize">{run.executionMode}</Badge>
                        {run.outcome?.workflowUsed && <Badge variant="outline">{run.outcome.workflowUsed}</Badge>}
                        {run.recordingEnabled && <Badge variant="outline">Recording enabled</Badge>}
                        {run.shareToken && <Badge variant="outline" className="border-emerald-200 text-emerald-700">Shared</Badge>}
                        {run.captureCount > 0 && <Badge variant="secondary">{run.captureCount} captures</Badge>}
                        {run.replayCount > 0 && <Badge variant="secondary">{run.replayCount} replays</Badge>}
                        {issueCount > 0 && (
                          <Badge variant="destructive">{issueCount} issues</Badge>
                        )}
                      </div>
                      <CardDescription className="truncate" title={targetUrl}>
                        {targetUrl}
                      </CardDescription>
                      <p className="text-sm text-muted-foreground line-clamp-2">{summaryText}</p>
                      {run.outcome?.userGoal && <p className="text-xs text-muted-foreground">Goal: {run.outcome.userGoal}</p>}
                      {run.shareToken && (
                        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5" />
                          Public review enabled{run.sharedAt ? ` · updated ${timeAgo(run.sharedAt)}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {sharedHref && (
                        <Link href={sharedHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                          Open shared
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                      <Link href={`/dashboard/runs/${run.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                        Open run
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pt-0">
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="font-mono text-xs">{run.id}</span>
                    <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{timeAgo(run.startedAt)}</span>
                    <span>{formatDuration(run.startedAt, run.endedAt)}</span>
                    <span className="flex items-center gap-1.5"><Monitor className="h-3.5 w-3.5" />{run.viewportWidth ?? "—"}×{run.viewportHeight ?? "—"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />{run.captureCount} captures</span>
                    <span className="inline-flex items-center gap-1.5"><Video className="h-3.5 w-3.5" />{run.replayCount} replays</span>
                    <span className="inline-flex items-center gap-1.5"><Network className="h-3.5 w-3.5" />{run.networkRequestCount} requests / {run.networkErrorCount} failed</span>
                    <span className={cn("inline-flex items-center gap-1.5", run.consoleErrorCount > 0 && "text-red-600")}><SquareTerminal className="h-3.5 w-3.5" />{run.consoleErrorCount} errors / {run.consoleWarningCount} warnings</span>
                    {issueCount > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-red-600"><AlertTriangle className="h-3.5 w-3.5" />Needs attention</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
