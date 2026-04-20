"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RecordingItem } from "../run-detail-types";

export function ReplayTab({ primaryRecording }: { primaryRecording: RecordingItem | null }) {
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
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
            No replay video was saved for this run.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
