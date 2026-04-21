"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Video } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardWs } from "@/lib/use-dashboard-ws";
import { cn } from "@/lib/utils";
import type { RecordingItem } from "../run-detail-types";

export function ReplayTab({
  runId,
  primaryRecording,
  recordingEnabled,
}: {
  runId: string;
  primaryRecording: RecordingItem | null;
  recordingEnabled?: boolean;
}) {
  const [liveRecording, setLiveRecording] = useState<RecordingItem | null>(primaryRecording);

  useEffect(() => {
    setLiveRecording(primaryRecording);
  }, [primaryRecording]);

  useDashboardWs<{ recordings: RecordingItem[] }>({
    enabled: recordingEnabled !== false,
    subscription: { channel: "recordings", runId },
    onMessage: (message) => {
      if (message.type !== "recordings") return;
      if (!message.data || typeof message.data !== "object" || !("recordings" in message.data)) return;
      const next = (message.data as { recordings: RecordingItem[] }).recordings;
      if (Array.isArray(next)) {
        setLiveRecording(next[0] ?? null);
      }
    },
  });

  const effectiveRecording = liveRecording;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Replay</CardTitle>
        <CardDescription>Recorded video evidence for this run.</CardDescription>
      </CardHeader>
      <CardContent>
        {effectiveRecording ? (
          <div className="flex flex-col gap-4">
            <video
              src={effectiveRecording.videoUrl}
              controls
              className="aspect-video w-full rounded-lg border bg-black shadow-sm"
            />
            <div className="flex flex-wrap items-center gap-4 text-base text-muted-foreground">
              <span>
                {effectiveRecording.durationMs
                  ? `${Math.floor(effectiveRecording.durationMs / 1000)}s`
                  : "—"}
              </span>
              <span>
                {effectiveRecording.viewportWidth ?? "—"}×{effectiveRecording.viewportHeight ?? "—"}
              </span>
              <Link
                href={effectiveRecording.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
              >
                Open video <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ) : recordingEnabled === false ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-8">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Video className="h-4 w-4 text-muted-foreground" />
              Recording was disabled for this run
            </div>
            <p className="text-sm text-muted-foreground">
              Recording is on by default for every browser session. This run was explicitly opted out with <code className="rounded bg-muted px-1.5 py-0.5 text-xs">record_video: false</code>. Start a new session without that flag to capture a replayable .webm.
            </p>
            <p className="text-xs text-muted-foreground">
              Screenshots, console logs, and network activity are always captured — see the other tabs for that evidence.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
            Recording was enabled for this run, but no replay video was saved. This usually means the video file was empty or the upload failed. Check the worker logs for finalization errors.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
