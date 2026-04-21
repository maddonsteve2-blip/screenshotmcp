"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type TimelineStep = {
  id: string;
  publicUrl: string | null;
  stepIndex: number | null;
  actionLabel: string | null;
  outcome: string | null;
  toolName: string | null;
  captionSource: string | null;
  agentNote: string | null;
  url: string;
  pageTitle: string | null;
  createdAt: string;
};

export default function RunTimelineCarousel({ steps }: { steps: TimelineStep[] }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  // Keyboard nav while carousel has focus.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement && el.contains(document.activeElement)) {
        if (e.key === "ArrowRight") scrollBy(320);
        if (e.key === "ArrowLeft") scrollBy(-320);
        if (e.key === "Home") el.scrollTo({ left: 0, behavior: "smooth" });
        if (e.key === "End") el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function scrollBy(delta: number) {
    scrollerRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  if (steps.length === 0) return null;

  return (
    <section className="relative">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Run timeline</h3>
          <p className="text-xs text-muted-foreground">
            {steps.length} step{steps.length === 1 ? "" : "s"} · each card is one tool call, captioned by the agent or auto-derived from the URL delta.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1">
          <button
            type="button"
            onClick={() => scrollBy(-320)}
            className="rounded-md border p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(320)}
            className="rounded-md border p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        tabIndex={0}
        className={cn(
          "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4",
          "scroll-smooth focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
        style={{ scrollbarGutter: "stable" }}
      >
        {steps.map((step, idx) => (
          <button
            key={step.id}
            type="button"
            onClick={() => setOpenIdx(idx)}
            className={cn(
              "group flex min-w-[280px] max-w-[280px] snap-start flex-col gap-2 rounded-lg border bg-card p-3 text-left",
              "transition hover:border-ring hover:shadow-sm",
            )}
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-md bg-muted">
              {step.publicUrl ? (
                <Image
                  src={step.publicUrl}
                  alt={step.actionLabel ?? `Step ${step.stepIndex ?? idx + 1}`}
                  fill
                  sizes="280px"
                  className="object-cover object-top"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No preview
                </div>
              )}
              <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium tabular-nums shadow-sm">
                #{step.stepIndex ?? idx + 1}
              </span>
              {step.captionSource === "agent" || step.captionSource === "hybrid" ? (
                <Badge variant="secondary" className="absolute right-2 top-2 text-[10px]">
                  agent note
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-sm font-semibold leading-snug line-clamp-2">
                {step.actionLabel ?? "Screenshot"}
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2">
                {step.outcome ?? step.url}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="truncate font-mono">{step.toolName ?? "browser"}</span>
                <span className="truncate">{hostFromUrl(step.url)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={openIdx !== null} onOpenChange={(v) => !v && setOpenIdx(null)}>
        <DialogContent
          aria-label="Step screenshot viewer"
          className="flex h-[95vh] w-[98vw] max-w-[98vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[98vw]"
        >
          {openIdx !== null && steps[openIdx] && (
            <>
              <div className="flex shrink-0 items-center justify-between gap-4 border-b bg-background/95 px-5 py-3 backdrop-blur">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    Step #{steps[openIdx]!.stepIndex ?? openIdx + 1} · {steps[openIdx]!.actionLabel ?? "Screenshot"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {steps[openIdx]!.outcome ?? "no visible change"}
                  </div>
                </div>
                <div className="shrink-0 font-mono text-xs text-muted-foreground">{steps[openIdx]!.toolName}</div>
              </div>

              <div className="flex-1 overflow-auto bg-muted/30">
                {steps[openIdx]!.publicUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={steps[openIdx]!.publicUrl!}
                    alt={steps[openIdx]!.actionLabel ?? "screenshot"}
                    className="mx-auto block max-w-none"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No image for this step
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t bg-background/95 px-5 py-2 backdrop-blur">
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <div className="break-all">
                    <span className="font-medium text-foreground">URL:</span> {steps[openIdx]!.url}
                  </div>
                  {steps[openIdx]!.pageTitle && (
                    <div className="truncate">
                      <span className="font-medium text-foreground">Title:</span> {steps[openIdx]!.pageTitle}
                    </div>
                  )}
                  {steps[openIdx]!.agentNote && (
                    <div className="line-clamp-2">
                      <span className="font-medium text-foreground">Agent note:</span> {steps[openIdx]!.agentNote}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 32);
  }
}
