"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Clock3, ExternalLink, FileImage, FileText, FolderSearch, Globe, Link2, Search, Video } from "lucide-react";
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
  shareToken: string | null;
  sharedAt: string | null;
};

type Recording = {
  id: string;
  sessionId: string;
  pageUrl: string | null;
  fileSize: number | null;
  durationMs: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  createdAt: string;
  videoUrl: string;
  shareToken: string | null;
  sharedAt: string | null;
};

type Artifact =
  | {
      id: string;
      kind: "capture";
      sessionId: string | null;
      title: string;
      createdAt: string;
      status: string;
      href: string | null;
      previewUrl: string | null;
      shareToken: string | null;
      sharedAt: string | null;
      meta: string[];
      flags: { pdf: boolean; fullPage: boolean };
    }
  | {
      id: string;
      kind: "replay";
      sessionId: string;
      title: string;
      createdAt: string;
      status: string;
      href: string;
      previewUrl: null;
      shareToken: string | null;
      sharedAt: string | null;
      meta: string[];
      flags: { pdf: false; fullPage: false };
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

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hostname(input?: string | null) {
  if (!input) return "Managed browser session";
  try {
    return new URL(input).hostname;
  } catch {
    return input;
  }
}

export default function ArtifactsPage() {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "capture" | "replay">("all");
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [shareFilter, setShareFilter] = useState<"all" | "shared" | "private">("all");

  const handleSocketMessage = useCallback((message: { type: string; data?: { screenshots?: Screenshot[]; recordings?: Recording[] }; message?: string }) => {
    if (message.type === "artifacts") {
      setScreenshots(message.data?.screenshots ?? []);
      setRecordings(message.data?.recordings ?? []);
      setError(null);
      setLoading(false);
      return;
    }

    if (message.type === "error") {
      setError(message.message ?? "We couldn’t load artifacts right now.");
      setLoading(false);
    }
  }, []);

  useDashboardWs({
    subscription: { channel: "artifacts" },
    onMessage: handleSocketMessage,
  });

  const artifacts = useMemo<Artifact[]>(() => {
    const captureArtifacts: Artifact[] = screenshots.map((screenshot) => ({
      id: screenshot.id,
      kind: "capture",
      sessionId: screenshot.sessionId,
      title: screenshot.url,
      createdAt: screenshot.createdAt,
      status: screenshot.status,
      href: screenshot.publicUrl,
      previewUrl: screenshot.publicUrl && !screenshot.publicUrl.endsWith(".pdf") ? screenshot.publicUrl : null,
      shareToken: screenshot.shareToken,
      sharedAt: screenshot.sharedAt,
      meta: [
        screenshot.publicUrl?.endsWith(".pdf")
          ? "PDF document"
          : `${screenshot.width}×${screenshot.height} · ${screenshot.format.toUpperCase()}`,
        screenshot.fullPage && !screenshot.publicUrl?.endsWith(".pdf") ? "Full page" : "",
      ].filter(Boolean),
      flags: {
        pdf: !!screenshot.publicUrl?.endsWith(".pdf"),
        fullPage: screenshot.fullPage,
      },
    }));

    const replayArtifacts: Artifact[] = recordings.map((recording) => ({
      id: recording.id,
      kind: "replay",
      sessionId: recording.sessionId,
      title: recording.pageUrl ?? "Managed browser session",
      createdAt: recording.createdAt,
      status: "available",
      href: recording.videoUrl,
      previewUrl: null,
      shareToken: recording.shareToken,
      sharedAt: recording.sharedAt,
      meta: [
        `Duration ${formatDuration(recording.durationMs)}`,
        `Viewport ${recording.viewportWidth ?? "—"}×${recording.viewportHeight ?? "—"}`,
        `Size ${formatFileSize(recording.fileSize)}`,
      ],
      flags: { pdf: false, fullPage: false },
    }));

    return [...captureArtifacts, ...replayArtifacts].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  }, [recordings, screenshots]);

  const filteredArtifacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return artifacts.filter((artifact) => {
      const matchesKind = kindFilter === "all" ? true : artifact.kind === kindFilter;
      const isLinked = !!artifact.sessionId;
      const matchesLink = linkFilter === "all" ? true : linkFilter === "linked" ? isLinked : !isLinked;
      const matchesShare = shareFilter === "all"
        ? true
        : shareFilter === "shared"
          ? Boolean(artifact.shareToken)
          : !artifact.shareToken;
      const matchesQuery = !normalizedQuery
        ? true
        : [artifact.id, artifact.sessionId, artifact.title, artifact.status, artifact.href]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);

      return matchesKind && matchesLink && matchesShare && matchesQuery;
    });
  }, [artifacts, kindFilter, linkFilter, query, shareFilter]);

  const summary = useMemo(() => ({
    total: artifacts.length,
    captures: artifacts.filter((artifact) => artifact.kind === "capture").length,
    replays: artifacts.filter((artifact) => artifact.kind === "replay").length,
    linked: artifacts.filter((artifact) => !!artifact.sessionId).length,
    shared: artifacts.filter((artifact) => Boolean(artifact.shareToken)).length,
  }), [artifacts]);

  return (
    <PageContainer width="data" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">Library</h1>
        <p className="text-muted-foreground">
          Searchable evidence library across captures and replays. Use Runs when you want the full execution story, findings, and next actions.
        </p>
        <LibraryTabs />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Runs remains the primary review surface. The Library is your secondary lookup for evidence.</span>
          <Link href="/dashboard/runs" className="text-primary hover:underline">
            Open runs
          </Link>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">All artifacts</p>
            <p className="text-2xl font-semibold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">Captures</p>
            <p className="text-2xl font-semibold">{summary.captures}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">Replays</p>
            <p className="text-2xl font-semibold">{summary.replays}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">Linked to runs</p>
            <p className="text-2xl font-semibold">{summary.linked}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-sm text-muted-foreground">From shared runs</p>
            <p className="text-2xl font-semibold">{summary.shared}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter artifacts</CardTitle>
          <CardDescription>
            Find a specific piece of evidence fast, then jump back to the run for context, findings, and diagnostics.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative w-full xl:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by URL, run ID, artifact ID, or status"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All artifacts"],
              ["capture", "Captures"],
              ["replay", "Replays"],
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={kindFilter === value ? "default" : "outline"}
                onClick={() => setKindFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All link states"],
              ["linked", "Linked to runs"],
              ["unlinked", "Not linked"],
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={linkFilter === value ? "default" : "outline"}
                onClick={() => setLinkFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All sharing"],
              ["shared", "Shared runs"],
              ["private", "Private or standalone"],
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
          <p className="text-sm text-muted-foreground">
            Showing {filteredArtifacts.length} of {artifacts.length} artifacts.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-40 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredArtifacts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FolderSearch className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No artifacts found</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {error ?? "Try a broader search or run a browser workflow to generate captures and replays."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {filteredArtifacts.map((artifact) => {
            const sharedHref = artifact.shareToken ? `/shared/runs/${encodeURIComponent(artifact.shareToken)}` : null;

            return (
              <Card key={`${artifact.kind}-${artifact.id}`} className="overflow-hidden">
                <div className="flex min-h-56 flex-col md:flex-row">
                <div className="relative flex h-56 w-full items-center justify-center border-b bg-muted md:h-auto md:w-72 lg:w-80 md:border-b-0 md:border-r">
                  {artifact.kind === "capture" ? (
                    artifact.previewUrl ? (
                      <Image src={artifact.previewUrl} alt={artifact.title} fill unoptimized sizes="(min-width: 1280px) 20rem, (min-width: 768px) 18rem, 100vw" className="h-full w-full object-cover object-top" />
                    ) : artifact.flags.pdf ? (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-8 w-8" />
                        <span className="text-sm">PDF</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileImage className="h-8 w-8" />
                        <span className="text-sm capitalize">{artifact.status}</span>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center gap-2 bg-black/95 px-6 py-8 text-white/75">
                      <Video className="h-8 w-8" />
                      <span className="text-sm">Replay evidence</span>
                    </div>
                  )}
                </div>

                <CardContent className="flex flex-1 flex-col justify-between p-5">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex flex-col gap-1">
                        <p className="truncate text-base font-medium" title={artifact.title}>{artifact.title}</p>
                        <p className="truncate text-sm text-muted-foreground" title={artifact.title}>{hostname(artifact.title)}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Badge variant="outline">{artifact.kind === "capture" ? "Capture" : "Replay"}</Badge>
                        <Badge variant={artifact.status === "done" || artifact.status === "available" ? "secondary" : "outline"} className="capitalize">
                          {artifact.status}
                        </Badge>
                        {artifact.shareToken && <Badge variant="secondary">Shared run</Badge>}
                        {artifact.flags.pdf && <Badge variant="outline">PDF</Badge>}
                        {artifact.flags.fullPage && <Badge variant="outline">Full page</Badge>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{timeAgo(artifact.createdAt)}</span>
                      {artifact.sessionId ? <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" />Run linked</span> : <span>Standalone artifact</span>}
                      {artifact.shareToken && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />Public review enabled{artifact.sharedAt ? ` · ${timeAgo(artifact.sharedAt)}` : ""}</span>}
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      {artifact.meta.map((entry) => (
                        <span key={entry} className="rounded-full border px-2 py-1">{entry}</span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {artifact.sessionId && (
                      <Link href={`/dashboard/runs/${artifact.sessionId}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                        View run
                      </Link>
                    )}
                    {sharedHref && (
                      <Link href={sharedHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                        <Globe className="mr-1.5 h-3.5 w-3.5" />
                        Open shared run
                      </Link>
                    )}
                    {artifact.href && (
                      <Link href={artifact.href} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Open artifact
                      </Link>
                    )}
                  </div>
                </CardContent>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
