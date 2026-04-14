"use client";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, Trash2, ExternalLink, Clock, Globe, Monitor, Loader2 } from "lucide-react";

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

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/recordings")
      .then((r) => r.json())
      .then((data) => setRecordings(data.recordings ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this recording? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await fetch(`/api/recordings/${id}`, { method: "DELETE" });
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Video className="h-6 w-6" />
          Session Recordings
        </h1>
        <p className="text-muted-foreground mt-1">
          Video recordings of browser automation sessions. Start recording by passing{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">record_video: true</code>{" "}
          to <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">browser_navigate</code>.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : recordings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Video className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">No recordings yet</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Start a browser session with <code className="bg-muted px-1 py-0.5 rounded text-xs">record_video: true</code>{" "}
              to capture a video of the entire session. The recording will appear here when the session is closed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {recordings.map((rec) => (
            <Card key={rec.id} className="overflow-hidden">
              <div className="flex flex-col lg:flex-row">
                {/* Video player */}
                <div className="lg:w-[480px] bg-black flex items-center justify-center min-h-[270px]">
                  {playingId === rec.id ? (
                    <video
                      src={rec.videoUrl}
                      controls
                      autoPlay
                      className="w-full h-full max-h-[360px]"
                    />
                  ) : (
                    <button
                      onClick={() => setPlayingId(rec.id)}
                      className="flex flex-col items-center gap-3 text-white/70 hover:text-white transition-colors p-8"
                    >
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center backdrop-blur">
                        <Video className="h-7 w-7" />
                      </div>
                      <span className="text-sm">Click to play</span>
                    </button>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-sm mb-1 truncate max-w-[300px]">
                        {rec.pageUrl || "Unknown page"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Session: <code className="font-mono">{rec.sessionId.slice(0, 12)}...</code>
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {timeAgo(rec.createdAt)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Duration: <span className="text-foreground">{formatDuration(rec.durationMs)}</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Monitor className="h-3.5 w-3.5" />
                      <span>Viewport: <span className="text-foreground">{rec.viewportWidth}×{rec.viewportHeight}</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Video className="h-3.5 w-3.5" />
                      <span>Size: <span className="text-foreground">{formatFileSize(rec.fileSize)}</span></span>
                    </div>
                    {rec.pageUrl && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Globe className="h-3.5 w-3.5" />
                        <a
                          href={rec.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate text-xs"
                        >
                          {new URL(rec.pageUrl).hostname}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      render={<a href={rec.videoUrl} target="_blank" rel="noopener noreferrer" />}
                    >
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
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
