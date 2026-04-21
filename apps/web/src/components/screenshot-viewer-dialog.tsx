"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Check,
  Copy,
  ExternalLink,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Share2,
  X,
} from "lucide-react";

type ScreenshotViewerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Publicly-accessible image URL (R2 CDN). Required. */
  src: string;
  /** Source URL of the page that was captured — shown in the header. */
  capturedUrl?: string | null;
  /** Optional page title / label shown above the URL. */
  title?: string | null;
  /** Natural image dimensions (for initial fit calculation). */
  width?: number | null;
  height?: number | null;
  /** Optional handler to open the share dialog (phase 3). */
  onShareClick?: () => void;
  /** If true, hides the Share button. Default false. */
  hideShare?: boolean;
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

export function ScreenshotViewerDialog({
  open,
  onOpenChange,
  src,
  capturedUrl,
  title,
  width,
  height,
  onShareClick,
  hideShare = false,
}: ScreenshotViewerProps) {
  // Viewport state — "fit" is the computed scale that fits the image; zoom=1 means 100%.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<"fit" | "actual" | "custom">("fit");
  const [copied, setCopied] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    width && height ? { w: width, h: height } : null,
  );

  // Reset on open or src change.
  useEffect(() => {
    if (open) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setMode("fit");
      setCopied(false);
    }
  }, [open, src]);

  // Compute the scale required to fit the image into the stage viewport.
  const computeFitScale = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !naturalSize) return 1;
    const pad = 32;
    const sw = stage.clientWidth - pad * 2;
    const sh = stage.clientHeight - pad * 2;
    if (sw <= 0 || sh <= 0) return 1;
    return Math.min(sw / naturalSize.w, sh / naturalSize.h, 1);
  }, [naturalSize]);

  const fitScale = computeFitScale();
  const effectiveScale = mode === "fit" ? fitScale : zoom;

  const handleZoomIn = () => {
    setMode("custom");
    setZoom((z) => Math.min(MAX_ZOOM, (z === 1 && mode === "fit" ? fitScale : z) * ZOOM_STEP));
  };
  const handleZoomOut = () => {
    setMode("custom");
    setZoom((z) => Math.max(MIN_ZOOM, (z === 1 && mode === "fit" ? fitScale : z) / ZOOM_STEP));
  };
  const handleFit = () => {
    setMode("fit");
    setPan({ x: 0, y: 0 });
  };
  const handleActual = () => {
    setMode("actual");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Wheel zoom (holds focus point stable).
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!naturalSize) return;
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const currentScale = effectiveScale;
    const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentScale * factor));
    if (nextScale === currentScale) return;

    // Zoom around cursor point.
    const stage = stageRef.current;
    if (stage) {
      const rect = stage.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2 - pan.x;
      const cy = e.clientY - rect.top - rect.height / 2 - pan.y;
      const ratio = nextScale / currentScale;
      setPan({
        x: pan.x - cx * (ratio - 1),
        y: pan.y - cy * (ratio - 1),
      });
    }
    setMode("custom");
    setZoom(nextScale);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    setIsPanning(true);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panStart.current) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    panStart.current = null;
    setIsPanning(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // Keyboard shortcuts while dialog is open.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleActual();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleFit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fitScale, zoom, mode]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(src);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const zoomPct = Math.round(effectiveScale * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label="Screenshot viewer"
        showCloseButton={false}
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:max-w-none"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b bg-background px-4 py-3">
          <div className="min-w-0 flex-1">
            {title && (
              <div className="truncate text-sm font-semibold">{title}</div>
            )}
            {capturedUrl && (
              <div className="truncate text-xs text-muted-foreground" title={capturedUrl}>
                {capturedUrl}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={copyUrl} className="gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy URL"}
            </Button>
            <Link
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Raw
            </Link>
            {!hideShare && onShareClick && (
              <Button type="button" size="sm" variant="outline" onClick={onShareClick} className="gap-1.5">
                <Share2 className="h-3.5 w-3.5" />
                Share
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Close viewer"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stage */}
        <div
          ref={stageRef}
          className="relative flex-1 select-none overflow-hidden bg-muted/40"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ cursor: isPanning ? "grabbing" : "grab" }}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${effectiveScale})`,
              transformOrigin: "center center",
              transition: isPanning ? "none" : "transform 120ms ease-out",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt={title ?? capturedUrl ?? "screenshot"}
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget;
                setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
              }}
              className="block max-w-none shadow-2xl"
              style={{ willChange: "transform" }}
            />
          </div>
        </div>

        {/* Footer toolbar */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-t bg-background px-4 py-2 text-xs">
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="ghost" onClick={handleZoomOut} aria-label="Zoom out">
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[3.5rem] text-center font-mono text-xs tabular-nums text-muted-foreground">
              {zoomPct}%
            </span>
            <Button type="button" size="icon" variant="ghost" onClick={handleZoomIn} aria-label="Zoom in">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-2 h-4 w-px bg-border" />
            <Button type="button" size="sm" variant="ghost" onClick={handleFit} className="gap-1.5">
              <Maximize2 className="h-3.5 w-3.5" />
              Fit
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={handleActual} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              100%
            </Button>
          </div>
          <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
            {naturalSize && (
              <span className="font-mono tabular-nums">
                {naturalSize.w} × {naturalSize.h}
              </span>
            )}
            <span className="text-muted-foreground/70">
              Wheel to zoom · Drag to pan · <kbd className="rounded border px-1">F</kbd> fit ·{" "}
              <kbd className="rounded border px-1">0</kbd> 100% ·{" "}
              <kbd className="rounded border px-1">Esc</kbd> close
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
