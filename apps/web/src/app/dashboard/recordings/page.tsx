"use client";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Video, Trash2, ExternalLink, Clock, Globe, Monitor, Loader2, Search, HardDrive, Link2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { LibraryTabs } from "@/components/library-tabs";
import { apiFetch } from "@/lib/api-fetch";
import { useDashboardWs } from "@/lib/use-dashboard-ws";
import { PageContainer } from "@/components/page-container";

interface Recording {
  id: string;
  sessionId: string;
  pageUrl: string | null;
  fileSize: number | null;
  durationMs: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  createdAt: string;
  videoUrl: string;
}

const PAGE_SIZE = 9;

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatIdentifier(value: string, start = 12, end = 6): string {
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function hostname(input: string | null) {
  if (!input) return "Unknown page";

  try {
    return new URL(input).hostname;
  } catch {
    return input;
  }
}

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visibleRecordingsCount, setVisibleRecordingsCount] = useState(PAGE_SIZE);

  const handleSocketMessage = useCallback((message: { type: string; data?: { recordings?: Recording[] }; message?: string }) => {
    if (message.type === "recordings") {
      setRecordings(message.data?.recordings ?? []);
      setError(null);
      setLoading(false);
      return;
    }

    if (message.type === "error") {
      setError(message.message ?? "We couldn’t load your replays right now.");
      setLoading(false);
    }
  }, []);

  useDashboardWs({
    subscription: { channel: "recordings" },
    onMessage: handleSocketMessage,
  });

  async function handleDelete(id: string) {
    const ok = await confirmDialog({
      title: "Delete this recording?",
      description: "The video file will be removed from storage. This cannot be undone.",
      confirmLabel: "Delete recording",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(id);
    try {
      const res = await apiFetch(`/api/recordings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      toast.success("Recording deleted");
    } catch (err) {
      toast.error("Could not delete recording", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setDeleting(null);
    }
  }

  const summary = useMemo(() => {
    const last24Hours = Date.now() - 24 * 60 * 60 * 1000;
    const totalDurationMs = recordings.reduce((sum, recording) => sum + (recording.durationMs ?? 0), 0);
    const totalBytes = recordings.reduce((sum, recording) => sum + (recording.fileSize ?? 0), 0);

    return {
      total: recordings.length,
      recent: recordings.filter((recording) => new Date(recording.createdAt).getTime() >= last24Hours).length,
      withPageUrl: recordings.filter((recording) => !!recording.pageUrl).length,
      totalDurationMs,
      totalBytes,
    };
  }, [recordings]);

  const filteredRecordings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return recordings;

    return recordings.filter((recording) => [
      recording.id,
      recording.sessionId,
      recording.pageUrl,
      recording.videoUrl,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery));
  }, [query, recordings]);

  const filteredSummary = useMemo(() => {
    const totalDurationMs = filteredRecordings.reduce((sum, recording) => sum + (recording.durationMs ?? 0), 0);
    const totalBytes = filteredRecordings.reduce((sum, recording) => sum + (recording.fileSize ?? 0), 0);

    return {
      total: filteredRecordings.length,
      totalDurationMs,
      totalBytes,
      withPageUrl: filteredRecordings.filter((recording) => !!recording.pageUrl).length,
    };
  }, [filteredRecordings]);

  const recentRecordings = filteredRecordings.slice(0, 6);
  const archiveRecordings = filteredRecordings.slice(6);
  const visibleArchiveRecordings = archiveRecordings.slice(0, visibleRecordingsCount);

  return (
    <PageContainer width="data" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-pretty">
          <Video className="h-6 w-6" aria-hidden="true" />
          Replays
        </h1>
        <p className="text-muted-foreground">
          Artifact library for replayable video evidence. Use Runs when you want the full session review with captures and replay together. Start recording by passing{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">record_video: true</code>{" "}
          to <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">browser_navigate</code>.
        </p>
        <LibraryTabs />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Runs is the primary review surface. Replays is a library view for individual recordings.</span>
          <Link href="/dashboard/runs" className="text-primary hover:underline">
            Open runs
          </Link>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">Total replays</p>
            <p className="text-2xl font-semibold tabular-nums">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">Created in 24h</p>
            <p className="text-2xl font-semibold tabular-nums">{summary.recent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">Known page URL</p>
            <p className="text-2xl font-semibold tabular-nums">{summary.withPageUrl}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">Library size</p>
            <p className="text-2xl font-semibold">{formatFileSize(summary.totalBytes)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter replays</CardTitle>
          <CardDescription>
            Search for a replay by session, URL, or recording ID, then open the run when you need the full diagnostic context.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <div className="flex flex-col gap-4">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search replays"
                autoComplete="off"
                spellCheck={false}
                name="recordingSearch"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by URL, run ID, or replay ID…"
                className="pl-9"
              />
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Search scope</p>
                <p className="text-sm text-muted-foreground">Matches session IDs, page URLs, replay IDs, and stored video URLs so you can jump straight to the proof you need.</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <div className="flex h-full flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current slice</p>
                <p className="text-3xl font-semibold tabular-nums">{filteredSummary.total}</p>
                <p className="text-sm text-muted-foreground">Matching replays from {recordings.length} total.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Duration</p>
                  <p className="mt-1 text-sm font-medium">{formatDuration(filteredSummary.totalDurationMs)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Known URLs</p>
                  <p className="mt-1 text-sm font-medium">{filteredSummary.withPageUrl} linked pages</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Storage slice</p>
                  <p className="mt-1 text-sm font-medium">{formatFileSize(filteredSummary.totalBytes)}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <ScanSearch className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Unable to load replays</p>
            <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
          </CardContent>
        </Card>
      ) : recordings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Video className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">No recordings yet</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Start a browser session with <code className="bg-muted px-1 py-0.5 rounded text-sm">record_video: true</code>{" "}
              to capture a video of the entire session. The recording will appear here when the session is closed.
            </p>
          </CardContent>
        </Card>
      ) : filteredRecordings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Search className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No replays match this filter</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Try a broader URL, session ID, or replay ID search to find the evidence you need.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {recentRecordings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Replays</CardTitle>
                <CardDescription>
                  Start with the newest recordings in a horizontal strip, then use the archive grid when you need deeper history.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
                  {recentRecordings.map((rec) => (
                    <article key={rec.id} className="min-w-[320px] max-w-[360px] snap-start">
                      <Card className="overflow-hidden">
                        <div className="flex h-44 items-center justify-center bg-black">
                          {playingId === rec.id ? (
                            <video src={rec.videoUrl} controls autoPlay className="h-full w-full" />
                          ) : (
                            <button
                              type="button"
                              aria-label={`Play replay for ${hostname(rec.pageUrl)}`}
                              onClick={() => setPlayingId(rec.id)}
                              className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-white/70 transition-colors hover:text-white"
                            >
                              <div className="flex size-16 items-center justify-center rounded-full bg-white/10 backdrop-blur">
                                <Video className="h-7 w-7" />
                              </div>
                              <span className="text-sm">Click to play</span>
                            </button>
                          )}
                        </div>
                        <CardContent className="flex flex-col gap-3 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-medium" title={rec.pageUrl || "Unknown page"}>{rec.pageUrl || "Unknown page"}</p>
                              <p className="truncate text-sm text-muted-foreground">{hostname(rec.pageUrl)}</p>
                            </div>
                            <Badge variant="secondary">{timeAgo(rec.createdAt)}</Badge>
                          </div>
                          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDuration(rec.durationMs)}</span>
                            <span className="inline-flex items-center gap-1"><Monitor className="h-3.5 w-3.5" />{rec.viewportWidth}×{rec.viewportHeight}</span>
                            <span className="inline-flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" />{formatFileSize(rec.fileSize)}</span>
                            <span className="inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" />{formatIdentifier(rec.id, 8, 4)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Link href={`/dashboard/runs/${rec.sessionId}`} className="inline-flex">
                              <Button size="sm" variant="outline">View run</Button>
                            </Link>
                            <Button size="sm" variant="outline" render={<a href={rec.videoUrl} target="_blank" rel="noopener noreferrer" />}>
                              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                              Open
                            </Button>
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
            <h3 className="text-base font-semibold">Replay Library</h3>
            <p className="text-sm text-muted-foreground">
              {archiveRecordings.length > 0
                ? `Showing ${visibleArchiveRecordings.length} of ${archiveRecordings.length} archived replays in a denser grid.`
                : "All matching replays are already surfaced in the recent strip above."}
            </p>
          </div>

          {archiveRecordings.length > 0 ? (
            <>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                {visibleArchiveRecordings.map((rec) => (
                  <Card key={rec.id} className="overflow-hidden [contain-intrinsic-size:360px] [content-visibility:auto]">
                    <div className="flex h-48 items-center justify-center bg-black">
                      {playingId === rec.id ? (
                        <video src={rec.videoUrl} controls autoPlay className="h-full w-full" />
                      ) : (
                        <button
                          type="button"
                          aria-label={`Play replay for ${hostname(rec.pageUrl)}`}
                          onClick={() => setPlayingId(rec.id)}
                          className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-white/70 transition-colors hover:text-white"
                        >
                          <div className="flex size-16 items-center justify-center rounded-full bg-white/10 backdrop-blur">
                            <Video className="h-7 w-7" />
                          </div>
                          <span className="text-sm">Click to play</span>
                        </button>
                      )}
                    </div>
                    <CardContent className="flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-medium" title={rec.pageUrl || "Unknown page"}>{rec.pageUrl || "Unknown page"}</p>
                          <p className="truncate text-sm text-muted-foreground">{hostname(rec.pageUrl)}</p>
                        </div>
                        <Badge variant="secondary">{timeAgo(rec.createdAt)}</Badge>
                      </div>
                      <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDuration(rec.durationMs)}</span>
                        <span className="inline-flex items-center gap-1"><Monitor className="h-3.5 w-3.5" />{rec.viewportWidth}×{rec.viewportHeight}</span>
                        <span className="inline-flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" />{formatFileSize(rec.fileSize)}</span>
                        <span className="inline-flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{hostname(rec.pageUrl)}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/dashboard/runs/${rec.sessionId}`} className="inline-flex">
                          <Button size="sm" variant="outline">View run</Button>
                        </Link>
                        <Button size="sm" variant="outline" render={<a href={rec.videoUrl} target="_blank" rel="noopener noreferrer" />}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Open
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(rec.id)}
                          disabled={deleting === rec.id}
                        >
                          {deleting === rec.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {archiveRecordings.length > visibleRecordingsCount && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={() => setVisibleRecordingsCount((current) => current + PAGE_SIZE)}>
                    Show 9 more
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-2 py-10 text-center">
                <p className="font-medium">No older replays match this filter.</p>
                <p className="text-sm text-muted-foreground">Use the recent strip above or broaden your search for a wider archive view.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageContainer>
  );
}
