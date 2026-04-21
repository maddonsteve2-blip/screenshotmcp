"use client";

import Link from "next/link";
import { ExternalLink, Video } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RecordingItem } from "../run-detail-types";

export function ReplayTab({
  primaryRecording,
  recordingEnabled,
}: {
  primaryRecording: RecordingItem | null;
  recordingEnabled?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Replay</CardTitle>
        <CardDescription>Recorded video evidence for this run.</CardDescription>
      </CardHeader>
      <CardContent>
        {primaryRecording ? (
          <div className="flex flex-col gap-4">
            <video
              src={primaryRecording.videoUrl}
              controls
              className="aspect-video w-full rounded-lg border bg-black shadow-sm"
            />
            <div className="flex flex-wrap items-center gap-4 text-base text-muted-foreground">
              <span>
                {primaryRecording.durationMs
                  ? `${Math.floor(primaryRecording.durationMs / 1000)}s`
                  : "—"}
              </span>
              <span>
                {primaryRecording.viewportWidth ?? "—"}×{primaryRecording.viewportHeight ?? "—"}
              </span>
              <Link
                href={primaryRecording.videoUrl}
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
              Recording wasn&apos;t enabled for this run
            </div>
            <p className="text-sm text-muted-foreground">
              Replay videos are opt-in. Pass <code className="rounded bg-muted px-1.5 py-0.5 text-xs">record_video: true</code> to <code className="rounded bg-muted px-1.5 py-0.5 text-xs">browser_navigate</code> (MCP) or <code className="rounded bg-muted px-1.5 py-0.5 text-xs">--record</code> to <code className="rounded bg-muted px-1.5 py-0.5 text-xs">npx screenshotsmcp browser:start</code> (CLI) to capture the whole session as a .webm video.
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
