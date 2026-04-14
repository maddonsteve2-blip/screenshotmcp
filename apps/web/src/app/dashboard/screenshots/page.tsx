"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, Check, ImageOff, FileText } from "lucide-react";

type Screenshot = {
  id: string;
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

  useEffect(() => {
    fetch("/api/screenshots")
      .then((r) => r.json())
      .then((d) => { setScreenshots(d.screenshots ?? []); setLoading(false); });
  }, []);

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const done = screenshots.filter((s) => s.status === "done");
  const pending = screenshots.filter((s) => s.status !== "done");

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Captures</h1>
        <p className="text-muted-foreground mt-1">Recent screenshot, PDF, and export artifacts from your browser workflows</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
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
                        <span className="text-xs text-muted-foreground">{timeAgo(s.createdAt)}</span>
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
                        <span className="text-xs text-muted-foreground">
                          {s.publicUrl?.endsWith(".pdf") ? "PDF document" : `${s.width}×${s.height} · ${s.format.toUpperCase()}`}
                          {s.fullPage && !s.publicUrl?.endsWith(".pdf") ? " · Full page" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">{timeAgo(s.createdAt)}</span>
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
