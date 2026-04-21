"use client";

import Image from "next/image";
import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScreenshotViewerDialog } from "@/components/screenshot-viewer-dialog";
import { useDashboardWs } from "@/lib/use-dashboard-ws";
import type { ScreenshotItem } from "../run-detail-types";

export function CapturesTab({ runId, screenshots }: { runId: string; screenshots: ScreenshotItem[] }) {
  const [liveScreenshots, setLiveScreenshots] = useState<ScreenshotItem[]>(screenshots);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const active = activeIdx != null ? liveScreenshots[activeIdx] : null;

  useDashboardWs<{ screenshots: ScreenshotItem[] }>({
    subscription: { channel: "screenshots", runId },
    onMessage: (message) => {
      if (message.type !== "screenshots") return;
      if (!message.data || typeof message.data !== "object" || !("screenshots" in message.data)) return;
      const next = (message.data as { screenshots: ScreenshotItem[] }).screenshots;
      if (Array.isArray(next)) {
        // Sort by step index then createdAt for the run detail view.
        const sorted = [...next].sort((a, b) => {
          const ai = typeof a.stepIndex === "number" ? a.stepIndex : Number.MAX_SAFE_INTEGER;
          const bi = typeof b.stepIndex === "number" ? b.stepIndex : Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        setLiveScreenshots(sorted);
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session captures</CardTitle>
        <CardDescription>Click any capture to open the full viewer, zoom, annotate, or share it.</CardDescription>
      </CardHeader>
      <CardContent>
        {liveScreenshots.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
            No captures were persisted for this run yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {liveScreenshots.map((shot, idx) => (
              <Card key={shot.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => shot.publicUrl && setActiveIdx(idx)}
                  className="group relative block h-56 w-full overflow-hidden bg-muted md:h-64 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Open capture ${shot.url}`}
                  disabled={!shot.publicUrl}
                >
                  {shot.publicUrl ? (
                    <>
                      <Image
                        src={shot.publicUrl}
                        alt={shot.url}
                        fill
                        unoptimized
                        sizes="(min-width: 1280px) 50vw, 100vw"
                        className="object-cover object-top transition-transform group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                        <span className="inline-flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-sm font-medium shadow">
                          <Maximize2 className="h-3.5 w-3.5" />
                          Open viewer
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Pending</div>
                  )}
                </button>
                <CardContent className="flex flex-col gap-3 p-4">
                  <p className="truncate text-sm text-muted-foreground" title={shot.url}>{shot.url}</p>
                  <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                    <span>
                      {shot.width}×{shot.height ?? "—"} · {shot.format.toUpperCase()}
                    </span>
                    {shot.publicUrl && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => setActiveIdx(idx)}
                      >
                        <Maximize2 className="h-3 w-3" />
                        Open viewer
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>

      {active?.publicUrl && (
        <ScreenshotViewerDialog
          open={activeIdx != null}
          onOpenChange={(o) => { if (!o) setActiveIdx(null); }}
          src={active.publicUrl}
          title={active.url}
          capturedUrl={active.url}
          screenshotId={active.id}
        />
      )}
    </Card>
  );
}
