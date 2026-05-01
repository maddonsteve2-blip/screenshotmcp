"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { Annotation } from "@/components/screenshot-annotations";

/**
 * Public read-only embed of a shared screenshot + its annotations.
 * Uses the same AnnotationLayer in "none" tool mode so existing shapes
 * render but cannot be edited or deleted by visitors.
 */
export function SharedScreenshotViewer({
  src,
  shareToken,
  width,
  height,
  annotations,
}: {
  src: string;
  shareToken: string;
  width: number;
  height: number;
  annotations: Annotation[];
}) {
  const [natural, setNatural] = useState<{ w: number; h: number }>({
    w: width || 0,
    h: height || 0,
  });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileName = src.split("?")[0]?.split("/").pop() || "shared-screenshot.png";
  const downloadHref = `/api/shared/screenshots/${encodeURIComponent(shareToken)}/download`;

  // If server-supplied dims are missing, fall back to img onLoad.
  useEffect(() => {
    if (natural.w > 0 && natural.h > 0) return;
    const el = imgRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth) {
      setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    }
  }, [natural.h, natural.w]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-neutral-900 shadow-2xl">
      <div className="flex items-center justify-end gap-2 border-b border-white/10 bg-black/20 px-4 py-3">
        <a
          href={downloadHref}
          download={fileName}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="h-3.5 w-3.5" />
          Download image
        </a>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open raw image
        </a>
      </div>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt="Shared screenshot"
          draggable={false}
          className="block w-full"
          onLoad={(e) => {
            const el = e.currentTarget;
            if (natural.w === 0 || natural.h === 0) {
              setNatural({ w: el.naturalWidth, h: el.naturalHeight });
            }
          }}
        />
        {natural.w > 0 && natural.h > 0 && annotations.length > 0 && (
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
          >
            <svg
              viewBox={`0 0 ${natural.w} ${natural.h}`}
              preserveAspectRatio="none"
              className="h-full w-full"
            >
              <ReadonlyAnnotationLayerContents
                width={natural.w}
                height={natural.h}
                annotations={annotations}
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Lightweight duplicate of the annotation render logic from
 * `<AnnotationLayer>` that omits editing handlers. We can't reuse
 * AnnotationLayer directly because it uses its own SVG wrapper and
 * pointer handlers which we don't want on the public page.
 *
 * Kept in sync with the editable layer's render branches.
 */
function ReadonlyAnnotationLayerContents({
  width,
  height,
  annotations,
}: {
  width: number;
  height: number;
  annotations: Annotation[];
}) {
  const strokeWidth = Math.max(2, width / 400);
  const COLOR_HEX: Record<string, string> = {
    red: "#ef4444",
    yellow: "#eab308",
    green: "#22c55e",
    blue: "#3b82f6",
  };
  return (
    <>
      <defs>
        {Object.keys(COLOR_HEX).map((c) => (
          <marker
            key={c}
            id={`sarrow-${c}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={COLOR_HEX[c]} />
          </marker>
        ))}
      </defs>
      {annotations.map((a) => {
        const hex = COLOR_HEX[a.color] ?? COLOR_HEX.red;
        if (a.type === "rect") {
          return (
            <rect
              key={a.id}
              x={a.x}
              y={a.y}
              width={Math.abs(a.w)}
              height={Math.abs(a.h)}
              fill="transparent"
              stroke={hex}
              strokeWidth={strokeWidth}
            />
          );
        }
        if (a.type === "arrow") {
          return (
            <line
              key={a.id}
              x1={a.x1}
              y1={a.y1}
              x2={a.x2}
              y2={a.y2}
              stroke={hex}
              strokeWidth={strokeWidth}
              markerEnd={`url(#sarrow-${a.color})`}
            />
          );
        }
        if (a.type === "path") {
          const d = a.points
            .map((pt, i) => `${i === 0 ? "M" : "L"}${pt[0]},${pt[1]}`)
            .join(" ");
          return (
            <path
              key={a.id}
              d={d}
              fill="none"
              stroke={hex}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        if (a.type === "text") {
          return (
            <text
              key={a.id}
              x={a.x}
              y={a.y}
              fill={hex}
              fontSize={a.fontSize}
              fontWeight="600"
              paintOrder="stroke"
              stroke="white"
              strokeWidth={Math.max(2, a.fontSize / 8)}
              strokeLinejoin="round"
            >
              {a.text}
            </text>
          );
        }
        return null;
      })}
    </>
  );
}
