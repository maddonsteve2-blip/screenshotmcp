"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ExternalLink, Copy, Check, ImageOff, FileText, Search, Clock3, Link2, ScanSearch } from "lucide-react";
import { LibraryTabs } from "@/components/library-tabs";
import { useDashboardWs } from "@/lib/use-dashboard-ws";
import { PageContainer } from "@/components/page-container";

type Screenshot = {
  id: string;
  sessionId: string | null;
  url: string;
  status: string;
  publicUrl: string | null;
  width: number;
  height: number;
  fullPage: boolean;
  format: string;
  createdAt: string;
  completedAt: string | null;
};

type StatusFilter = "all" | "done" | "attention" | "failed";
type LibraryView = "attention" | "completed" | "all";

const PAGE_SIZE = 12;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function hostname(input: string) {
  try {
    return new URL(input).hostname;
  } catch {
    return input;
  }
}

function isPdfCapture(screenshot: Screenshot) {
  return Boolean(screenshot.publicUrl?.endsWith(".pdf"));
}

function formatStatusLabel(status: string) {
  if (status === "done") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "processing") return "Processing";
  return "Pending";
}

function CapturePreview({
  screenshot,
  copiedId,
  onCopy,
  previewHeightClass,
}: {
  screenshot: Screenshot;
  copiedId: string | null;
  onCopy: (text: string, id: string) => Promise<void>;
  previewHeightClass: string;
}) {
  const pdf = isPdfCapture(screenshot);

  return (
    <div className={`group relative overflow-hidden bg-muted ${previewHeightClass}`}>
      {screenshot.publicUrl ? (
        pdf ? (
          <>
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <FileText className="h-10 w-10 text-muted-foreground/50" />
              <span className="text-sm">PDF Document</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-[background-color,opacity] group-hover:bg-black/20 group-hover:opacity-100">
              <Link href={screenshot.publicUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "gap-1")}>
                <ExternalLink data-icon="inline-start" />
                Open PDF
              </Link>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1"
                onClick={() => void onCopy(screenshot.publicUrl!, `url-${screenshot.id}`)}
              >
                {copiedId === `url-${screenshot.id}` ? <Check data-icon="inline-start" className="text-green-500" /> : <Copy data-icon="inline-start" />}
                Copy URL
              </Button>
            </div>
          </>
        ) : (
          <>
            <img
              src={screenshot.publicUrl}
              alt={screenshot.url}
              width={screenshot.width}
              height={screenshot.height}
              className="h-full w-full object-cover object-top transition-transform group-hover:scale-[1.02]"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-[background-color,opacity] group-hover:bg-black/20 group-hover:opacity-100">
              <Link href={screenshot.publicUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "gap-1")}>
                <ExternalLink data-icon="inline-start" />
                View
              </Link>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1"
                onClick={() => void onCopy(screenshot.publicUrl!, `url-${screenshot.id}`)}
              >
                {copiedId === `url-${screenshot.id}` ? <Check data-icon="inline-start" className="text-green-500" /> : <Copy data-icon="inline-start" />}
                Copy URL
              </Button>
            </div>
          </>
        )
      ) : (
        <div className="flex h-full items-center justify-center">
          <ImageOff className="h-6 w-6 text-muted-foreground/30" />
        </div>
      )}
    </div>
  );
}

export default function ScreenshotsPage() {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [artifactFilter, setArtifactFilter] = useState<"all" | "linked" | "pdf" | "full-page">("all");
  const [activeView, setActiveView] = useState<LibraryView>("attention");
  const [visibleCompletedCount, setVisibleCompletedCount] = useState(PAGE_SIZE);
  const [visibleAllCount, setVisibleAllCount] = useState(PAGE_SIZE);

  const handleSocketMessage = useCallback((message: { type: string; data?: { screenshots?: Screenshot[] }; message?: string }) => {
    if (message.type === "screenshots") {
      setScreenshots(message.data?.screenshots ?? []);
      setError(null);
      setLoading(false);
      return;
    }

    if (message.type === "error") {
      setError(message.message ?? "We couldn’t load your captures right now.");
      setLoading(false);
    }
  }, []);

  useDashboardWs({
    subscription: { channel: "screenshots" },
    onMessage: handleSocketMessage,
  });

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const counts = useMemo(() => ({
    total: screenshots.length,
    attention: screenshots.filter((s) => s.status !== "done").length,
    failed: screenshots.filter((s) => s.status === "failed").length,
    linked: screenshots.filter((s) => !!s.sessionId).length,
    pdfs: screenshots.filter((s) => s.publicUrl?.endsWith(".pdf")).length,
  }), [screenshots]);

  const filteredScreenshots = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return screenshots.filter((s) => {
      const statusMatch = statusFilter === "all"
        ? true
        : statusFilter === "done"
          ? s.status === "done"
          : statusFilter === "failed"
            ? s.status === "failed"
            : s.status !== "done";

      const artifactMatch = (() => {
        if (artifactFilter === "all") return true;
        if (artifactFilter === "linked") return !!s.sessionId;
        if (artifactFilter === "pdf") return !!s.publicUrl?.endsWith(".pdf");
        return s.fullPage;
      })();

      const queryMatch = !normalizedQuery || [s.id, s.sessionId, s.url, s.status, s.publicUrl]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);

      return statusMatch && artifactMatch && queryMatch;
    });
  }, [artifactFilter, query, screenshots, statusFilter]);

  const completedScreenshots = filteredScreenshots.filter((s) => s.status === "done");
  const attentionScreenshots = filteredScreenshots.filter((s) => s.status !== "done");
  const failedScreenshots = attentionScreenshots.filter((s) => s.status === "failed");
  const activeScreenshots = attentionScreenshots.filter((s) => s.status !== "failed");
  const recentCompleted = completedScreenshots.slice(0, 6);
  const visibleCompletedScreenshots = completedScreenshots.slice(0, visibleCompletedCount);
  const visibleAllScreenshots = filteredScreenshots.slice(0, visibleAllCount);
  const statusFilterLabel = {
    all: "All statuses",
    done: "Completed",
    attention: "Needs attention",
    failed: "Failed",
  } satisfies Record<StatusFilter, string>;
  const artifactFilterLabel = {
    all: "All artifacts",
    linked: "Linked to runs",
    pdf: "PDF exports",
    "full-page": "Full page",
  } satisfies Record<"all" | "linked" | "pdf" | "full-page", string>;
  const resolvedActiveView = activeView === "attention" && attentionScreenshots.length === 0
    ? completedScreenshots.length > 0
      ? "completed"
      : "all"
    : activeView;

  return (
    <PageContainer width="data" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-pretty">Captures</h1>
        <p className="text-muted-foreground">
          Artifact library for screenshot, PDF, and export outputs. Use Runs when you want the full story of a session.
        </p>
        <LibraryTabs />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Runs is the primary review surface. Captures is a library view for individual artifacts.</span>
          <Link href="/dashboard/runs" className="text-primary hover:underline">
            Open runs
          </Link>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">Total captures</p>
            <p className="text-2xl font-semibold tabular-nums">{counts.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">Needs attention</p>
            <p className="text-2xl font-semibold tabular-nums">{counts.attention}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">Failed captures</p>
            <p className="text-2xl font-semibold tabular-nums">{counts.failed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">Linked to runs</p>
            <p className="text-2xl font-semibold tabular-nums">{counts.linked}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">PDF exports</p>
            <p className="text-2xl font-semibold tabular-nums">{counts.pdfs}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter captures</CardTitle>
          <CardDescription>
            Use this library to find specific exports fast, then jump back to the parent run when you need the full execution context.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="flex flex-col gap-5">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search captures"
                autoComplete="off"
                spellCheck={false}
                name="captureSearch"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by URL, run ID, status, or capture ID…"
                className="pl-9"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                  <p className="text-sm text-muted-foreground">Choose the review state you want to scan.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["all", "All statuses"],
                    ["done", "Completed"],
                    ["attention", "Needs attention"],
                    ["failed", "Failed"],
                  ] as const).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={statusFilter === value ? "default" : "outline"}
                      onClick={() => setStatusFilter(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Artifact type</p>
                  <p className="text-sm text-muted-foreground">Narrow to run-linked, PDF, or full-page output.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["all", "All artifacts"],
                    ["linked", "Linked to runs"],
                    ["pdf", "PDF exports"],
                    ["full-page", "Full page"],
                  ] as const).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={artifactFilter === value ? "default" : "outline"}
                      onClick={() => setArtifactFilter(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <div className="flex h-full flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current slice</p>
                <p className="text-3xl font-semibold tabular-nums">{filteredScreenshots.length}</p>
                <p className="text-sm text-muted-foreground">Matching captures from {screenshots.length} total.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status scope</p>
                  <p className="mt-1 text-sm font-medium">{statusFilterLabel[statusFilter]}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Artifact scope</p>
                  <p className="mt-1 text-sm font-medium">{artifactFilterLabel[artifactFilter]}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Library mix</p>
                  <p className="mt-1 text-sm font-medium">{completedScreenshots.length} completed · {attentionScreenshots.length} active</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <ScanSearch className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Unable to load captures</p>
            <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
          </CardContent>
        </Card>
      ) : screenshots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <ImageOff className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No screenshots yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Ask your AI assistant to &ldquo;take a screenshot of https://example.com&rdquo; after installing the MCP server.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={resolvedActiveView} onValueChange={(value) => setActiveView(value as LibraryView)} className="flex flex-col gap-6">
          <div className="flex justify-start">
            <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
              <TabsTrigger value="attention">Queue & Failed ({attentionScreenshots.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed Gallery ({completedScreenshots.length})</TabsTrigger>
              <TabsTrigger value="all">All Captures ({filteredScreenshots.length})</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="attention" className="flex flex-col gap-6">
            {attentionScreenshots.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col gap-2 py-12 text-center">
                  <p className="font-medium">Nothing needs attention.</p>
                  <p className="text-sm text-muted-foreground">All filtered captures are completed, so the queue is clear.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {failedScreenshots.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Failed captures</h3>
                      <p className="text-sm text-muted-foreground">Keep failures together so triage happens before you review successful proof.</p>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-4">
                      {failedScreenshots.map((screenshot) => (
                        <Card key={screenshot.id} className="border-red-200/80">
                          <CardContent className="flex flex-col gap-4 p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-base font-medium" title={screenshot.url}>{screenshot.url}</p>
                                <p className="truncate text-sm text-muted-foreground">{hostname(screenshot.url)}</p>
                              </div>
                              <Badge variant="outline" className="border-red-200 text-red-700">Failed</Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                              <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{timeAgo(screenshot.createdAt)}</span>
                              <span>{screenshot.width}×{screenshot.height}</span>
                              {screenshot.sessionId && <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" />Run linked</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {screenshot.sessionId && (
                                <Link href={`/dashboard/runs/${screenshot.sessionId}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                                  Open run
                                </Link>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {activeScreenshots.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Processing Queue</CardTitle>
                      <CardDescription>
                        Use this horizontal lane like a carousel to check what’s still rendering without pushing the completed gallery further down the page.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
                        {activeScreenshots.map((screenshot) => (
                          <Card key={screenshot.id} className="min-w-[320px] snap-start border-dashed">
                            <div className="flex h-44 items-center justify-center bg-muted">
                              <div className="text-sm text-muted-foreground">{formatStatusLabel(screenshot.status)}…</div>
                            </div>
                            <CardContent className="flex flex-col gap-3 p-4">
                              <div className="min-w-0">
                                <p className="truncate text-base font-medium" title={screenshot.url}>{screenshot.url}</p>
                                <p className="truncate text-sm text-muted-foreground">{hostname(screenshot.url)}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <Badge variant="secondary" className="capitalize">{formatStatusLabel(screenshot.status)}</Badge>
                                <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{timeAgo(screenshot.createdAt)}</span>
                              </div>
                              {screenshot.sessionId && (
                                <div>
                                  <Link href={`/dashboard/runs/${screenshot.sessionId}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                                    View run
                                  </Link>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="completed" className="flex flex-col gap-6">
            {completedScreenshots.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col gap-2 py-12 text-center">
                  <p className="font-medium">No completed captures match this filter.</p>
                  <p className="text-sm text-muted-foreground">Try broadening the search or switch back to Queue & Failed.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {recentCompleted.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Completed</CardTitle>
                      <CardDescription>
                        Start with the newest proof in a horizontal strip, then drop into the full gallery only when you need more history.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
                        {recentCompleted.map((screenshot) => (
                          <article key={screenshot.id} className="min-w-[320px] max-w-[360px] snap-start">
                            <Card className="overflow-hidden">
                              <CapturePreview screenshot={screenshot} copiedId={copiedId} onCopy={copy} previewHeightClass="h-44" />
                              <CardContent className="flex flex-col gap-3 p-4">
                                <div className="min-w-0">
                                  <p className="truncate text-base font-medium" title={screenshot.url}>{screenshot.url}</p>
                                  <p className="truncate text-sm text-muted-foreground">{hostname(screenshot.url)}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                  <span>{isPdfCapture(screenshot) ? "PDF document" : `${screenshot.width}×${screenshot.height} · ${screenshot.format.toUpperCase()}`}</span>
                                  {screenshot.fullPage && !isPdfCapture(screenshot) && <span>· Full page</span>}
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                                  <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{timeAgo(screenshot.createdAt)}</span>
                                  {screenshot.sessionId && (
                                    <Link href={`/dashboard/runs/${screenshot.sessionId}`} className="text-primary hover:underline">
                                      View run
                                    </Link>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </article>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="flex flex-col gap-1">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-base font-semibold">Completed Gallery</h3>
                    <p className="text-sm text-muted-foreground">
                      Showing {visibleCompletedScreenshots.length} of {completedScreenshots.length} completed captures in a denser grid.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                  {visibleCompletedScreenshots.map((screenshot) => (
                    <Card key={screenshot.id} className="overflow-hidden [contain-intrinsic-size:360px] [content-visibility:auto]">
                      <CapturePreview screenshot={screenshot} copiedId={copiedId} onCopy={copy} previewHeightClass="h-48" />
                      <CardContent className="flex flex-col gap-3 p-4">
                        <div className="min-w-0 flex flex-col gap-1">
                          <p className="truncate text-base font-medium" title={screenshot.url}>{screenshot.url}</p>
                          <p className="truncate text-sm text-muted-foreground">{hostname(screenshot.url)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span>{isPdfCapture(screenshot) ? "PDF document" : `${screenshot.width}×${screenshot.height} · ${screenshot.format.toUpperCase()}`}</span>
                          {screenshot.fullPage && !isPdfCapture(screenshot) && <span>· Full page</span>}
                          {screenshot.sessionId && <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" />Run linked</span>}
                        </div>
                        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{timeAgo(screenshot.createdAt)}</span>
                          {screenshot.sessionId && (
                            <Link href={`/dashboard/runs/${screenshot.sessionId}`} className="text-primary hover:underline">
                              View run
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {completedScreenshots.length > visibleCompletedCount && (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => setVisibleCompletedCount((current) => current + PAGE_SIZE)}>
                      Show 12 more
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="all" className="flex flex-col gap-6">
            {filteredScreenshots.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col gap-2 py-12 text-center">
                  <p className="font-medium">No captures match this filter.</p>
                  <p className="text-sm text-muted-foreground">Try a broader query or change the status and artifact filters.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-base font-semibold">Full Capture Archive</h3>
                    <p className="text-sm text-muted-foreground">
                      Showing {visibleAllScreenshots.length} of {filteredScreenshots.length} filtered captures.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                  {visibleAllScreenshots.map((screenshot) => (
                    <Card key={screenshot.id} className="overflow-hidden [contain-intrinsic-size:340px] [content-visibility:auto]">
                      {screenshot.status === "done" ? (
                        <CapturePreview screenshot={screenshot} copiedId={copiedId} onCopy={copy} previewHeightClass="h-40" />
                      ) : (
                        <div className="flex h-40 items-center justify-center bg-muted">
                          <div className="text-sm text-muted-foreground">{formatStatusLabel(screenshot.status)}…</div>
                        </div>
                      )}
                      <CardContent className="flex flex-col gap-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-medium" title={screenshot.url}>{screenshot.url}</p>
                            <p className="truncate text-sm text-muted-foreground">{hostname(screenshot.url)}</p>
                          </div>
                          <Badge variant={screenshot.status === "done" ? "secondary" : "outline"} className="capitalize">
                            {formatStatusLabel(screenshot.status)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span>{isPdfCapture(screenshot) ? "PDF document" : `${screenshot.width}×${screenshot.height}`}</span>
                          {screenshot.fullPage && !isPdfCapture(screenshot) && <span>· Full page</span>}
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{timeAgo(screenshot.createdAt)}</span>
                        </div>
                        {screenshot.sessionId && (
                          <div>
                            <Link href={`/dashboard/runs/${screenshot.sessionId}`} className="text-sm text-primary hover:underline">
                              View run
                            </Link>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {filteredScreenshots.length > visibleAllCount && (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => setVisibleAllCount((current) => current + PAGE_SIZE)}>
                      Show 12 more
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  );
}
