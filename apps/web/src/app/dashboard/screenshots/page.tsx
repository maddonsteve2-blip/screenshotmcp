"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Copy, Check, ImageOff, FileText, Search, Clock3, Link2, ScanSearch } from "lucide-react";

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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ScreenshotsPage() {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "done" | "processing">("all");
  const [artifactFilter, setArtifactFilter] = useState<"all" | "linked" | "pdf" | "full-page">("all");

  useEffect(() => {
    fetch("/api/screenshots")
      .then((r) => r.json())
      .then((d) => {
        setScreenshots(d.screenshots ?? []);
        setError(null);
      })
      .catch(() => {
        setError("We couldn’t load your captures right now.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const counts = useMemo(() => ({
    total: screenshots.length,
    inProgress: screenshots.filter((s) => s.status !== "done").length,
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

  const done = filteredScreenshots.filter((s) => s.status === "done");
  const pending = filteredScreenshots.filter((s) => s.status !== "done");

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Captures</h1>
        <p className="text-muted-foreground mt-1">Artifact library for screenshot, PDF, and export outputs. Use Runs when you want the full story of a session.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Runs is the primary review surface. Captures is a library view for individual artifacts.</span>
          <Link href="/dashboard/runs" className="text-primary hover:underline">
            Open runs
          </Link>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Total captures</p>
            <p className="text-2xl font-semibold">{counts.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">In progress</p>
            <p className="text-2xl font-semibold">{counts.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Linked to runs</p>
            <p className="text-2xl font-semibold">{counts.linked}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">PDF exports</p>
            <p className="text-2xl font-semibold">{counts.pdfs}</p>
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
        <CardContent className="space-y-4">
          <div className="relative w-full xl:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by URL, run ID, status, or capture ID"
              className="pl-9"
            />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {([
                ["all", "All statuses"],
                ["done", "Completed"],
                ["processing", "In progress"],
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
          <p className="text-xs text-muted-foreground">
            Showing {filteredScreenshots.length} of {screenshots.length} captures.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <>
          {pending.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">In Progress</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pending.map((s) => (
                  <Card key={s.id} className="overflow-hidden">
                    <div className="h-36 bg-muted flex items-center justify-center">
                      <div className="text-xs text-muted-foreground animate-pulse">
                        {s.status === "processing" ? "Processing…" : "Pending…"}
                      </div>
                    </div>
                    <CardContent className="p-3 space-y-1">
                      <p className="text-xs text-muted-foreground truncate">{s.url}</p>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs capitalize">{s.status}</Badge>
                        <div className="flex items-center gap-3">
                          {s.sessionId && (
                            <Link href={`/dashboard/runs/${s.sessionId}`} className="text-xs text-primary hover:underline">
                              View run
                            </Link>
                          )}
                          <span className="text-xs text-muted-foreground">{timeAgo(s.createdAt)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {done.length > 0 && (
            <div className="space-y-2">
              {pending.length > 0 && (
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Completed</h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {done.map((s) => (
                  <Card key={s.id} className="overflow-hidden group">
                    <div className="h-36 bg-muted overflow-hidden relative">
                      {s.publicUrl ? (
                        s.publicUrl.endsWith(".pdf") ? (
                          <>
                            <div className="flex flex-col items-center justify-center h-full gap-2">
                              <FileText className="h-10 w-10 text-muted-foreground/50" />
                              <span className="text-xs text-muted-foreground">PDF Document</span>
                            </div>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                              <a href={s.publicUrl} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="secondary" className="h-7 text-xs gap-1">
                                  <ExternalLink className="h-3 w-3" />
                                  Open PDF
                                </Button>
                              </a>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs gap-1"
                                onClick={() => copy(s.publicUrl!, `url-${s.id}`)}
                              >
                                {copiedId === `url-${s.id}`
                                  ? <Check className="h-3 w-3 text-green-500" />
                                  : <Copy className="h-3 w-3" />}
                                Copy URL
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <img
                              src={s.publicUrl}
                              alt={s.url}
                              className="w-full h-full object-cover object-top transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                              <a href={s.publicUrl} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="secondary" className="h-7 text-xs gap-1">
                                  <ExternalLink className="h-3 w-3" />
                                  View
                                </Button>
                              </a>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs gap-1"
                                onClick={() => copy(s.publicUrl!, `url-${s.id}`)}
                              >
                                {copiedId === `url-${s.id}`
                                  ? <Check className="h-3 w-3 text-green-500" />
                                  : <Copy className="h-3 w-3" />}
                                Copy URL
                              </Button>
                            </div>
                          </>
                        )
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <ImageOff className="h-6 w-6 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3 space-y-1">
                      <p className="text-xs text-muted-foreground truncate" title={s.url}>{s.url}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {s.publicUrl?.endsWith(".pdf") ? "PDF document" : `${s.width}×${s.height} · ${s.format.toUpperCase()}`}
                            {s.fullPage && !s.publicUrl?.endsWith(".pdf") ? " · Full page" : ""}
                          </span>
                          {s.sessionId && <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" />Run linked</span>}
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{timeAgo(s.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {s.sessionId && (
                            <Link href={`/dashboard/runs/${s.sessionId}`} className="text-xs text-primary hover:underline">
                              View run
                            </Link>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
