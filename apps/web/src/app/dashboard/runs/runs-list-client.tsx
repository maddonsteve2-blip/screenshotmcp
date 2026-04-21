"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDashboardWs } from "@/lib/use-dashboard-ws";
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

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export default function RunsListClient({ runs }: { runs: RunListItem[] }) {
  const [liveRuns, setLiveRuns] = useState<RunListItem[]>(runs);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "failed">("all");
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [evidenceFilter, setEvidenceFilter] = useState<"all" | "has-evidence" | "captures" | "replays" | "issues">("all");
  const [shareFilter, setShareFilter] = useState<"all" | "shared" | "private">("all");

  useDashboardWs<{ runs: RunListItem[] }>({
    subscription: { channel: "runs" },
    onMessage: (message) => {
      if (message.type !== "runs") return;
      if (!message.data || typeof message.data !== "object" || !("runs" in message.data)) return;
      const next = (message.data as { runs: RunListItem[] }).runs;
      if (Array.isArray(next)) setLiveRuns(next);
    },
  });

  const modeOptions = useMemo(
    () => ["all", ...Array.from(new Set(liveRuns.map((run) => run.executionMode).filter(Boolean))).sort()],
    [liveRuns],
  );

  const filteredRuns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return liveRuns.filter((run) => {
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
  }, [evidenceFilter, liveRuns, modeFilter, query, shareFilter, statusFilter]);

  const counts = useMemo(() => ({
    active: liveRuns.filter((run) => run.status === "active").length,
    failed: liveRuns.filter((run) => run.status === "failed").length,
    withEvidence: liveRuns.filter((run) => run.captureCount > 0 || run.replayCount > 0).length,
    withIssues: liveRuns.filter((run) => run.consoleErrorCount > 0 || run.networkErrorCount > 0).length,
    shared: liveRuns.filter((run) => Boolean(run.shareToken)).length,
  }), [liveRuns]);

  if (liveRuns.length === 0) {
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
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by URL, title, status, or run ID"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground lg:ml-auto">
              Showing {filteredRuns.length} of {runs.length} runs
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <FilterGroup label="Status">
              {(["all", "active", "completed", "failed"] as const).map((status) => (
                <FilterPill
                  key={status}
                  active={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                >
                  <span className="capitalize">{status}</span>
                </FilterPill>
              ))}
            </FilterGroup>

            <FilterGroup label="Mode">
              {modeOptions.map((mode) => (
                <FilterPill
                  key={mode}
                  active={modeFilter === mode}
                  onClick={() => setModeFilter(mode)}
                >
                  <span className="capitalize">{mode === "all" ? "All" : mode}</span>
                </FilterPill>
              ))}
            </FilterGroup>

            <FilterGroup label="Evidence">
              {([
                ["all", "All"],
                ["has-evidence", "Any"],
                ["captures", "Captures"],
                ["replays", "Replays"],
                ["issues", "Issues"],
              ] as const).map(([value, label]) => (
                <FilterPill
                  key={value}
                  active={evidenceFilter === value}
                  onClick={() => setEvidenceFilter(value)}
                >
                  {label}
                </FilterPill>
              ))}
            </FilterGroup>

            <FilterGroup label="Sharing">
              {([
                ["all", "All"],
                ["shared", "Shared"],
                ["private", "Private"],
              ] as const).map(([value, label]) => (
                <FilterPill
                  key={value}
                  active={shareFilter === value}
                  onClick={() => setShareFilter(value)}
                >
                  {label}
                </FilterPill>
              ))}
            </FilterGroup>
          </div>
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
