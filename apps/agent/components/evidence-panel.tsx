"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Zap,
  Search,
  Accessibility,
  Eye,
  ExternalLink,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Link,
} from "lucide-react";
import type { EvidenceItem, FindingEvidence, ScreenshotEvidence, ActivityItem } from "@/lib/types";

// --- Activity Feed ---

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const recent = [...items].reverse().slice(0, 6);
  return (
    <div className="mb-5 space-y-1">
      {recent.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md bg-gray-800/60 border border-gray-700/40"
        >
          {item.status === "running" ? (
            <Loader2 className="w-3 h-3 text-blue-400 animate-spin flex-shrink-0" />
          ) : item.status === "done" ? (
            <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
          ) : (
            <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
          )}
          <span
            className={
              item.status === "running"
                ? "text-gray-300"
                : item.status === "done"
                ? "text-gray-500"
                : "text-red-400"
            }
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Screenshot Card ---

function ScreenshotCard({ item }: { item: ScreenshotEvidence }) {
  return (
    <div className="mb-3 group">
      <div className="relative overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
        <img
          src={item.url}
          alt={item.caption || "Screenshot"}
          className="w-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(item.url, "_blank")}
        />
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ExternalLink className="w-3.5 h-3.5 text-white" />
        </a>
      </div>
      {item.caption && (
        <p className="text-xs text-gray-400 mt-1.5 truncate px-0.5">{item.caption}</p>
      )}
    </div>
  );
}

// --- Performance Card ---

function PerfMetric({
  label,
  value,
  unit,
  threshold,
}: {
  label: string;
  value: number | undefined;
  unit: string;
  threshold: [number, number];
}) {
  if (value === undefined || value === null) return null;
  const status = value <= threshold[0] ? "good" : value <= threshold[1] ? "ok" : "bad";
  const color =
    status === "good" ? "text-green-400" : status === "ok" ? "text-yellow-400" : "text-red-400";
  const bg =
    status === "good"
      ? "bg-green-500/10 border-green-500/20"
      : status === "ok"
      ? "bg-yellow-500/10 border-yellow-500/20"
      : "bg-red-500/10 border-red-500/20";
  const display = value < 10 ? value.toFixed(2) : Math.round(value).toString();
  return (
    <div className={`flex flex-col items-center p-2 rounded-lg border ${bg}`}>
      <span className={`text-sm font-bold ${color}`}>
        {display}
        <span className="text-[10px] font-normal ml-0.5">{unit}</span>
      </span>
      <span className="text-[10px] text-gray-500 mt-0.5">{label}</span>
    </div>
  );
}

function PerformanceCard({ data }: { data: Record<string, unknown> }) {
  const lcp = data.lcp as number | undefined;
  const fcp = data.fcp as number | undefined;
  const cls = data.cls as number | undefined;
  const ttfb = data.ttfb as number | undefined;
  const hasMetrics = lcp !== undefined || fcp !== undefined || cls !== undefined || ttfb !== undefined;

  if (!hasMetrics) {
    return (
      <pre className="text-xs text-gray-400 overflow-auto max-h-40 whitespace-pre-wrap break-words">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <PerfMetric label="LCP" value={lcp} unit="s" threshold={[2.5, 4]} />
        <PerfMetric label="FCP" value={fcp} unit="s" threshold={[1.8, 3]} />
        <PerfMetric label="CLS" value={cls} unit="" threshold={[0.1, 0.25]} />
        <PerfMetric label="TTFB" value={ttfb} unit="s" threshold={[0.8, 1.8]} />
      </div>
      {(data.domSize != null || data.resourceCount != null) && (
        <div className="text-xs text-gray-500 flex gap-4 pt-1.5 border-t border-gray-700/50">
          {data.domSize != null && <span>DOM: {data.domSize as number} nodes</span>}
          {data.resourceCount != null && <span>Resources: {data.resourceCount as number}</span>}
          {data.totalTransferSize != null && (
            <span>Transfer: {Math.round((data.totalTransferSize as number) / 1024)}KB</span>
          )}
        </div>
      )}
    </div>
  );
}

// --- SEO Card ---

function SeoCard({ data }: { data: Record<string, unknown> }) {
  const rows = [
    { label: "Title", value: data.title },
    { label: "Description", value: data.description },
    {
      label: "H1",
      value: Array.isArray(data.h1)
        ? data.h1.slice(0, 2).join(", ")
        : data.h1,
    },
    { label: "Canonical", value: data.canonical },
    { label: "OG Title", value: data.ogTitle ?? (data as any)["og:title"] },
    { label: "OG Type", value: data.ogType ?? (data as any)["og:type"] },
  ].filter((r) => r.value);

  if (rows.length === 0) {
    return (
      <pre className="text-xs text-gray-400 overflow-auto max-h-40 whitespace-pre-wrap break-words">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map(({ label, value }) => (
        <div key={label} className="text-xs">
          <span className="text-gray-500 font-medium">{label}: </span>
          <span className="text-gray-300 break-words">{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

// --- Accessibility Card ---

function A11yCard({ data }: { data: Record<string, unknown> }) {
  const violations = (data.violations as any[]) ?? [];
  const passes = (data.passes as any[]) ?? [];
  const incomplete = (data.incomplete as any[]) ?? [];
  const critical = violations.filter(
    (v: any) => v.impact === "critical" || v.impact === "serious"
  );

  if (violations.length === 0 && passes.length === 0) {
    const failCount = typeof data.fail === "number" ? data.fail : null;
    const passCount = typeof data.pass === "number" ? data.pass : null;
    if (failCount !== null || passCount !== null) {
      return (
        <div className="flex gap-4 text-sm">
          {passCount !== null && (
            <span className="text-green-400">✓ {passCount} passed</span>
          )}
          {failCount !== null && (
            <span className="text-red-400">✗ {failCount} failed</span>
          )}
        </div>
      );
    }
    return (
      <pre className="text-xs text-gray-400 overflow-auto max-h-40 whitespace-pre-wrap break-words">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-xs">
        <span className="text-green-400">✓ {passes.length} passed</span>
        {violations.length > 0 && (
          <span className="text-red-400">✗ {violations.length} violations</span>
        )}
        {incomplete.length > 0 && (
          <span className="text-yellow-400">⚠ {incomplete.length} incomplete</span>
        )}
      </div>
      {critical.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-gray-700/50">
          <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">
            Critical Issues
          </p>
          {critical.slice(0, 4).map((v: any, i: number) => (
            <div key={i} className="flex items-start gap-1.5 text-xs">
              <AlertCircle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-gray-400 leading-snug">
                {v.description ?? v.id ?? String(v)}
              </span>
            </div>
          ))}
          {critical.length > 4 && (
            <p className="text-xs text-gray-600">+{critical.length - 4} more</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- UX Card ---

function UxCard({ data }: { data: Record<string, unknown> }) {
  const categories = data.categories as
    | Record<string, { score?: number; rating?: string; issues?: any[] }>
    | undefined;

  if (categories && Object.keys(categories).length > 0) {
    return (
      <div className="space-y-2">
        {Object.entries(categories).map(([cat, info]) => {
          const score = info.score ?? 0;
          const color =
            score >= 80
              ? "text-green-400"
              : score >= 60
              ? "text-yellow-400"
              : "text-red-400";
          const barColor =
            score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
          return (
            <div key={cat}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-gray-400">{cat}</span>
                <span className={`font-semibold ${color}`}>
                  {info.score !== undefined ? `${info.score}/100` : info.rating ?? "—"}
                </span>
              </div>
              {info.score !== undefined && (
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${info.score}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <pre className="text-xs text-gray-400 overflow-auto max-h-40 whitespace-pre-wrap break-words">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// --- Finding Card ---

const CATEGORY_META = {
  performance: { Icon: Zap, label: "Performance", color: "text-yellow-400" },
  seo: { Icon: Search, label: "SEO", color: "text-green-400" },
  accessibility: { Icon: Accessibility, label: "Accessibility", color: "text-purple-400" },
  ux: { Icon: Eye, label: "UX Review", color: "text-blue-400" },
} as const;

function FindingCard({ item }: { item: FindingEvidence }) {
  const [expanded, setExpanded] = useState(true);
  const meta = CATEGORY_META[item.category];
  const { Icon } = meta;

  return (
    <div className="mb-2 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <button
        className="flex items-center justify-between w-full text-left px-3 py-2.5 hover:bg-gray-800/80 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <span className={meta.color}>
            <Icon className="w-3.5 h-3.5" />
          </span>
          <span className="text-sm font-medium text-gray-200">{meta.label}</span>
        </div>
        <span className="text-gray-600 text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="border-t border-gray-700/50 px-3 py-2.5">
          {item.category === "performance" && <PerformanceCard data={item.data} />}
          {item.category === "seo" && <SeoCard data={item.data} />}
          {item.category === "accessibility" && <A11yCard data={item.data} />}
          {item.category === "ux" && <UxCard data={item.data} />}
        </div>
      )}
    </div>
  );
}

// --- Main Panel ---

interface Props {
  items: EvidenceItem[];
  activity?: ActivityItem[];
  lockedUrl?: string;
}

export function EvidencePanel({ items, activity = [], lockedUrl }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const screenshots = items.filter((i): i is ScreenshotEvidence => i.type === "screenshot");
  const findings = items.filter((i): i is FindingEvidence => i.type === "finding");
  const runningCount = activity.filter((a) => a.status === "running").length;
  const hasContent = items.length > 0 || activity.length > 0;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [items.length, activity.length, runningCount]);

  return (
    <div className="h-full min-h-0 w-full bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-gray-800 flex items-center gap-2 flex-shrink-0">
        <Camera className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-white">Results</h2>
        {runningCount > 0 && (
          <span className="flex items-center gap-1 text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            {runningCount} running
          </span>
        )}
        {items.length > 0 && (
          <span className="ml-auto text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full font-medium">
            {items.length}
          </span>
        )}
      </div>

      {/* Locked URL badge */}
      {lockedUrl && (
        <div className="px-4 py-2 border-b border-gray-800 bg-blue-500/5 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs">
            <Link className="w-3 h-3 text-blue-400 flex-shrink-0" />
            <span className="text-blue-300 font-medium truncate">{lockedUrl}</span>
          </div>
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 scroll-smooth">
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-3">
              <Camera className="w-6 h-6 text-gray-600" />
            </div>
            <p className="text-sm text-gray-500 leading-relaxed max-w-[200px]">
              Lock a URL above, then use the quick actions to start an audit
            </p>
          </div>
        ) : (
          <>
            {activity.length > 0 && <ActivityFeed items={activity} />}

            {/* Loading skeleton when tools are running but no evidence yet */}
            {activity.some(a => a.status === "running") && items.length === 0 && (
              <div className="py-4 space-y-3">
                <div className="h-4 bg-gray-800/80 rounded animate-pulse w-3/4" />
                <div className="h-24 bg-gray-800/80 rounded animate-pulse" />
                <div className="h-4 bg-gray-800/80 rounded animate-pulse w-1/2" />
              </div>
            )}

            {screenshots.length > 0 && (
              <section className="mb-5">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Screenshots ({screenshots.length})
                </h3>
                {screenshots.map((item, i) => (
                  <ScreenshotCard key={i} item={item} />
                ))}
              </section>
            )}

            {findings.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Findings ({findings.length})
                </h3>
                {findings.map((item, i) => (
                  <FindingCard key={i} item={item} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
