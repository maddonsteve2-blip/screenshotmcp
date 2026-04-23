"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Annotation } from "./screenshot-annotations";

/**
 * Small preview component that renders a screenshot with its annotations.
 * Used in cards and lists to show the edited version without opening the full viewer.
 */
export function ScreenshotAnnotatedPreview({
  src,
  alt,
  width,
  height,
  annotations,
  className,
  children,
}: {
  src: string;
  alt: string;
  width: number;
  height: number | null;
  annotations: Annotation[];
  className?: string;
  children?: React.ReactNode;
}) {
  const [naturalSize, setNaturalSize] = useState({ w: width, h: height ?? 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  // Update natural size when image loads
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth) {
      setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
    }
  }, [width, height]);

  const strokeWidth = Math.max(1, naturalSize.w / 600);
  const COLOR_HEX: Record<string, string> = {
    red: "#ef4444",
    yellow: "#eab308", 
    green: "#22c55e",
    blue: "#3b82f6",
  };

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      {/* Base image */}
      <Image
        ref={imgRef}
        src={src}
        alt={alt}
        fill
        unoptimized
        sizes="(min-width: 1280px) 50vw, 100vw"
        className="object-cover object-top"
        onLoad={(e) => {
          const el = e.currentTarget;
          if (el.naturalWidth && el.naturalHeight) {
            setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
          }
        }}
      />
      
      {/* Annotations overlay */}
      {naturalSize.w > 0 && naturalSize.h > 0 && annotations.length > 0 && (
        <svg
          viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full pointer-events-none"
          aria-hidden="true"
        >
          <defs>
            {Object.keys(COLOR_HEX).map((c) => (
              <marker
                key={c}
                id={`sarrow-${c}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="4"
                markerHeight="4"
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
                  strokeWidth={Math.max(1, a.fontSize / 10)}
                  strokeLinejoin="round"
                >
                  {a.text}
                </text>
              );
            }
            return null;
          })}
        </svg>
      )}
      
      {/* Optional overlay content (like hover states) */}
      {children}
    </div>
  );
}
