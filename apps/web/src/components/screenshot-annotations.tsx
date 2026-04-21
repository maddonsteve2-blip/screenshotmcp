"use client";

import { nanoid } from "nanoid";
import { useCallback, useRef, useState } from "react";

/**
 * Annotation types stored as JSONB on screenshots.annotations.
 * Coordinates are always in NATURAL image pixel space so they scale
 * correctly alongside the image when the viewer zooms/pans.
 */
export type AnnotationColor = "red" | "yellow" | "green" | "blue";

export const COLOR_HEX: Record<AnnotationColor, string> = {
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
};

export type AnnotationRect = {
  id: string;
  type: "rect";
  color: AnnotationColor;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type AnnotationArrow = {
  id: string;
  type: "arrow";
  color: AnnotationColor;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type AnnotationPath = {
  id: string;
  type: "path";
  color: AnnotationColor;
  points: Array<[number, number]>;
};

export type AnnotationText = {
  id: string;
  type: "text";
  color: AnnotationColor;
  x: number;
  y: number;
  text: string;
  fontSize: number;
};

export type Annotation =
  | AnnotationRect
  | AnnotationArrow
  | AnnotationPath
  | AnnotationText;

export type AnnotationTool = "none" | "rect" | "arrow" | "pen" | "text";

/**
 * SVG overlay that matches the natural image dimensions. Must be rendered
 * inside the same transform wrapper as the image so annotations scale and
 * pan together with it.
 *
 * Hit-testing: the overlay is rendered with `pointer-events: auto` only when
 * a drawing tool is active; otherwise clicks fall through to the stage pan
 * handler.
 */
export function AnnotationLayer({
  width,
  height,
  annotations,
  tool,
  color,
  fontSize = 18,
  onChange,
}: {
  width: number;
  height: number;
  annotations: Annotation[];
  tool: AnnotationTool;
  color: AnnotationColor;
  fontSize?: number;
  onChange: (next: Annotation[]) => void;
}) {
  // Use a ref for in-progress drag state so synthesized sequential
  // pointer events (and React 18 event batching) see the current shape
  // without waiting for re-render. We also mirror into state to drive
  // the preview render.
  const draggingRef = useRef<Annotation | null>(null);
  const [dragging, setDragging] = useState<Annotation | null>(null);
  const setDrag = useCallback((next: Annotation | null) => {
    draggingRef.current = next;
    setDragging(next);
  }, []);
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);

  // Convert a pointer event from screen space into natural image space.
  const toImagePoint = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  }, [width, height]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool === "none" || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as SVGElement).setPointerCapture?.(e.pointerId);

    const p = toImagePoint(e);
    if (tool === "text") {
      setPendingText(p);
      return;
    }

    const id = nanoid(8);
    if (tool === "rect") {
      setDrag({ id, type: "rect", color, x: p.x, y: p.y, w: 0, h: 0 });
    } else if (tool === "arrow") {
      setDrag({ id, type: "arrow", color, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    } else if (tool === "pen") {
      setDrag({ id, type: "path", color, points: [[p.x, p.y]] });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const current = draggingRef.current;
    if (!current) return;
    e.stopPropagation();
    const p = toImagePoint(e);
    if (current.type === "rect") {
      setDrag({ ...current, w: p.x - current.x, h: p.y - current.y });
    } else if (current.type === "arrow") {
      setDrag({ ...current, x2: p.x, y2: p.y });
    } else if (current.type === "path") {
      setDrag({ ...current, points: [...current.points, [p.x, p.y]] });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const current = draggingRef.current;
    if (!current) return;
    e.stopPropagation();
    // Discard zero-area drags to avoid accidental micro-shapes.
    let keep = true;
    if (current.type === "rect" && Math.abs(current.w) < 4 && Math.abs(current.h) < 4) keep = false;
    if (current.type === "arrow" &&
        Math.hypot(current.x2 - current.x1, current.y2 - current.y1) < 4) keep = false;
    if (current.type === "path" && current.points.length < 2) keep = false;

    if (keep) {
      // Normalize rect negative width/height.
      if (current.type === "rect") {
        const rect = { ...current };
        if (rect.w < 0) { rect.x = rect.x + rect.w; rect.w = -rect.w; }
        if (rect.h < 0) { rect.y = rect.y + rect.h; rect.h = -rect.h; }
        onChange([...annotations, rect]);
      } else {
        onChange([...annotations, current]);
      }
    }
    setDrag(null);
  };

  const deleteAnnotation = (id: string) => {
    onChange(annotations.filter((a) => a.id !== id));
  };

  const submitText = (text: string) => {
    if (pendingText && text.trim()) {
      const annotation: AnnotationText = {
        id: nanoid(8),
        type: "text",
        color,
        x: pendingText.x,
        y: pendingText.y,
        text: text.trim(),
        fontSize,
      };
      onChange([...annotations, annotation]);
    }
    setPendingText(null);
  };

  const strokeWidth = Math.max(2, width / 400); // scale stroke with image size
  const activeColor = COLOR_HEX[color];

  const allAnnotations = dragging ? [...annotations, dragging] : annotations;

  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="absolute inset-0"
        style={{ pointerEvents: tool === "none" ? "none" : "auto" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          {(Object.keys(COLOR_HEX) as AnnotationColor[]).map((c) => (
            <marker
              key={c}
              id={`arrow-${c}`}
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

        {allAnnotations.map((a) => {
          const hex = COLOR_HEX[a.color];
          if (a.type === "rect") {
            return (
              <g key={a.id} className="cursor-pointer" onClick={(e) => {
                if (tool !== "none") return;
                e.stopPropagation();
                if (confirm("Delete this annotation?")) deleteAnnotation(a.id);
              }}>
                <rect
                  x={a.x}
                  y={a.y}
                  width={Math.abs(a.w)}
                  height={Math.abs(a.h)}
                  fill="transparent"
                  stroke={hex}
                  strokeWidth={strokeWidth}
                />
              </g>
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
                markerEnd={`url(#arrow-${a.color})`}
                onClick={(e) => {
                  if (tool !== "none") return;
                  e.stopPropagation();
                  if (confirm("Delete this annotation?")) deleteAnnotation(a.id);
                }}
                className="cursor-pointer"
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
                onClick={(e) => {
                  if (tool !== "none") return;
                  e.stopPropagation();
                  if (confirm("Delete this annotation?")) deleteAnnotation(a.id);
                }}
                className="cursor-pointer"
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
                onClick={(e) => {
                  if (tool !== "none") return;
                  e.stopPropagation();
                  if (confirm("Delete this annotation?")) deleteAnnotation(a.id);
                }}
                className="cursor-pointer"
              >
                {a.text}
              </text>
            );
          }
          return null;
        })}

        {/* Preview marker while drawing (already included in allAnnotations) */}
        {tool !== "none" && (
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            stroke={activeColor}
            strokeWidth={strokeWidth / 2}
            strokeDasharray="8,4"
            opacity={0.3}
            pointerEvents="none"
          />
        )}
      </svg>

      {/* Text input popup — rendered outside SVG so we can use real <input>. */}
      {pendingText && (
        <TextInputOverlay
          x={pendingText.x}
          y={pendingText.y}
          imageWidth={width}
          imageHeight={height}
          color={COLOR_HEX[color]}
          fontSize={fontSize}
          onSubmit={submitText}
          onCancel={() => setPendingText(null)}
        />
      )}
    </>
  );
}

function TextInputOverlay({
  x,
  y,
  imageWidth,
  imageHeight,
  color,
  fontSize,
  onSubmit,
  onCancel,
}: {
  x: number;
  y: number;
  imageWidth: number;
  imageHeight: number;
  color: string;
  fontSize: number;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  // Position as % so it tracks with transform-based scaling.
  const left = `${(x / imageWidth) * 100}%`;
  const top = `${(y / imageHeight) * 100}%`;
  return (
    <div
      className="absolute"
      style={{ left, top, transform: "translate(0, -100%)" }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSubmit(value);
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => (value ? onSubmit(value) : onCancel())}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onCancel();
            }
          }}
          placeholder="Type a note…"
          className="rounded border-2 bg-white px-2 py-1 text-sm shadow-lg outline-none"
          style={{ borderColor: color, color, fontSize: fontSize * 0.8 }}
        />
      </form>
    </div>
  );
}
