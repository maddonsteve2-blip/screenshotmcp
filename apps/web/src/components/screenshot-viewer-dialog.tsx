"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Maximize2,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Square,
  Trash2,
  Type,
  X,
  Undo,
  Redo,
  Download,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  AnnotationLayer,
  COLOR_HEX,
  type Annotation,
  type AnnotationColor,
  type AnnotationTool,
} from "@/components/screenshot-annotations";
import { ScreenshotShareDialog } from "@/components/screenshot-share-dialog";
import { toast } from "sonner";

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
  /**
   * Screenshot id — when provided, annotations are loaded from
   * `/api/screenshots/{id}/annotations` on open and saved via PUT.
   * When omitted, the viewer is read-only (no annotation toolbar).
   */
  screenshotId?: string | null;
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
  screenshotId = null,
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

  // Annotation state (only used when screenshotId is provided).
  const [tool, setTool] = useState<AnnotationTool>("none");
  const [color, setColor] = useState<AnnotationColor>("red");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsDirty, setAnnotationsDirty] = useState(false);
  const [savingAnnotations, setSavingAnnotations] = useState(false);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);
  
  // Undo/redo history
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Load annotations when dialog opens for a given screenshotId.
  useEffect(() => {
    if (!open || !screenshotId) {
      setAnnotations([]);
      setAnnotationsDirty(false);
      setHistory([]);
      setHistoryIndex(-1);
      return;
    }
    let cancelled = false;
    setLoadingAnnotations(true);
    fetch(`/api/screenshots/${encodeURIComponent(screenshotId)}/annotations`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { annotations: [] })
      .then((data) => {
        if (cancelled) return;
        const loadedAnnotations = Array.isArray(data.annotations) ? data.annotations : [];
        setAnnotations(loadedAnnotations);
        setAnnotationsDirty(false);
        // Initialize history with the loaded annotations
        setHistory([loadedAnnotations]);
        setHistoryIndex(0);
      })
      .catch(() => {
        if (!cancelled) {
          setAnnotations([]);
          setHistory([[]]);
          setHistoryIndex(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAnnotations(false);
      });
    return () => { cancelled = true; };
  }, [open, screenshotId]);

  const updateAnnotations = useCallback((next: Annotation[]) => {
    setAnnotations(next);
    setAnnotationsDirty(true);
    // Add to history (remove any future states after current index)
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(next);
      // Keep history size reasonable (max 50 states)
      if (newHistory.length > 50) {
        return newHistory.slice(-50);
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setAnnotations(history[newIndex]);
      setHistoryIndex(newIndex);
      setAnnotationsDirty(true);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setAnnotations(history[newIndex]);
      setHistoryIndex(newIndex);
      setAnnotationsDirty(true);
    }
  }, [history, historyIndex]);

  const saveAnnotations = useCallback(async () => {
    if (!screenshotId) return;
    setSavingAnnotations(true);
    try {
      const res = await fetch(`/api/screenshots/${encodeURIComponent(screenshotId)}/annotations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations }),
      });
      if (res.ok) {
        setAnnotationsDirty(false);
        toast.success(annotations.length === 0 ? "Annotations cleared" : "Annotations saved");
      } else {
        // Surface the real reason so the user stops retrying silently. Save
        // previously swallowed every failure — users reported "it never saves"
        // because the button flashed back to "Saved" regardless of outcome.
        const body = await res.text().catch(() => "");
        const detail = body ? ` — ${body.slice(0, 200)}` : "";
        toast.error(`Couldn't save annotations (${res.status})${detail}`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Couldn't save annotations: ${err.message}`
          : "Couldn't save annotations",
      );
    } finally {
      setSavingAnnotations(false);
    }
  }, [annotations, screenshotId]);

  const clearAnnotations = useCallback(() => {
    if (annotations.length === 0) return;
    if (!confirm("Clear all annotations?")) return;
    updateAnnotations([]);
  }, [annotations.length, updateAnnotations]);

  const enableAnnotations = Boolean(screenshotId);
  const [shareOpen, setShareOpen] = useState(false);

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
    // Don't start panning when an annotation tool is active — the SVG layer
    // handles its own pointer events.
    if (tool !== "none") return;
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
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="shrink-0 gap-1.5"
              aria-label="Back to gallery"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
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
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {enableAnnotations && (
              <>
                <div className="mr-1 flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
                  <ToolButton active={tool === "none"} onClick={() => setTool("none")} label="Pan/select">
                    <MousePointer2 className="h-3.5 w-3.5" />
                  </ToolButton>
                  <ToolButton active={tool === "rect"} onClick={() => setTool("rect")} label="Rectangle">
                    <Square className="h-3.5 w-3.5" />
                  </ToolButton>
                  <ToolButton active={tool === "arrow"} onClick={() => setTool("arrow")} label="Arrow">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </ToolButton>
                  <ToolButton active={tool === "pen"} onClick={() => setTool("pen")} label="Freehand">
                    <Pencil className="h-3.5 w-3.5" />
                  </ToolButton>
                  <ToolButton active={tool === "text"} onClick={() => setTool("text")} label="Text">
                    <Type className="h-3.5 w-3.5" />
                  </ToolButton>
                </div>
                <div className="mr-1 flex items-center gap-0.5 rounded-md border bg-muted/40 p-1">
                  {(Object.keys(COLOR_HEX) as AnnotationColor[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`${c} color`}
                      onClick={() => setColor(c)}
                      className={cn(
                        "h-5 w-5 rounded-full ring-2 ring-transparent transition-all",
                        color === c && "ring-offset-2 ring-offset-background",
                      )}
                      style={{
                        backgroundColor: COLOR_HEX[c],
                        ringColor: color === c ? COLOR_HEX[c] : undefined,
                        boxShadow: color === c ? `0 0 0 2px ${COLOR_HEX[c]}` : undefined,
                      } as React.CSSProperties}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={undo}
                  disabled={historyIndex <= 0}
                  className="gap-1.5"
                  aria-label="Undo"
                >
                  <Undo className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1}
                  className="gap-1.5"
                  aria-label="Redo"
                >
                  <Redo className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearAnnotations}
                  disabled={annotations.length === 0}
                  className="gap-1.5"
                  aria-label="Clear all annotations"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={annotationsDirty ? "default" : "ghost"}
                  onClick={() => void saveAnnotations()}
                  disabled={savingAnnotations || !annotationsDirty}
                  className="gap-1.5"
                >
                  {savingAnnotations ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {annotationsDirty ? "Save" : loadingAnnotations ? "Loading" : "Saved"}
                </Button>
                <div className="mx-1 h-5 w-px bg-border" />
              </>
            )}
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
            {!hideShare && screenshotId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => (onShareClick ? onShareClick() : setShareOpen(true))}
                className="gap-1.5"
              >
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
          style={{
            cursor: tool !== "none"
              ? "crosshair"
              : isPanning ? "grabbing" : "grab",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${effectiveScale})`,
              transformOrigin: "center center",
              transition: isPanning ? "none" : "transform 120ms ease-out",
            }}
          >
            <div className="relative">
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
              {enableAnnotations && naturalSize && (
                <AnnotationLayer
                  width={naturalSize.w}
                  height={naturalSize.h}
                  annotations={annotations}
                  tool={tool}
                  color={color}
                  onChange={updateAnnotations}
                />
              )}
            </div>
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
      {screenshotId && (
        <ScreenshotShareDialog
          screenshotId={screenshotId}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}
    </Dialog>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
