"use client";

import { useState } from "react";
import {
  Camera,
  Zap,
  Search,
  Accessibility,
  Eye,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BarChart2,
} from "lucide-react";
import type { EvidenceItem, FindingEvidence, ScreenshotEvidence } from "@/lib/types";

interface Props {
  items: EvidenceItem[];
}

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

const CATEGORY_META: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  performance: {
    icon: <Zap className="w-3.5 h-3.5" />,
    label: "Performance",
    color: "text-yellow-400",
  },
  seo: {
    icon: <Search className="w-3.5 h-3.5" />,
    label: "SEO",
    color: "text-green-400",
  },
  accessibility: {
    icon: <Accessibility className="w-3.5 h-3.5" />,
    label: "Accessibility",
    color: "text-purple-400",
  },
  ux: {
    icon: <Eye className="w-3.5 h-3.5" />,
    label: "UX Review",
    color: "text-blue-400",
  },
};

function FindingCard({ item }: { item: FindingEvidence }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[item.category] ?? {
    icon: <BarChart2 className="w-3.5 h-3.5" />,
    label: item.category,
    color: "text-gray-400",
  };

  return (
    <div className="mb-2 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <button
        className="flex items-center justify-between w-full text-left px-3 py-2.5 hover:bg-gray-750 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <span className={meta.color}>{meta.icon}</span>
          <span className="text-sm font-medium text-gray-200">{meta.label}</span>
        </div>
        <span className="text-gray-500 ml-2">
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 px-3 py-2">
          <pre className="text-xs text-gray-300 overflow-auto max-h-56 bg-gray-900 rounded p-2 leading-relaxed whitespace-pre-wrap break-words">
            {JSON.stringify(item.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function EvidencePanel({ items }: Props) {
  const screenshots = items.filter(
    (i): i is ScreenshotEvidence => i.type === "screenshot"
  );
  const findings = items.filter(
    (i): i is FindingEvidence => i.type === "finding"
  );

  return (
    <div className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-gray-800 flex items-center gap-2">
        <Camera className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-white">Evidence</h2>
        {items.length > 0 && (
          <span className="ml-auto text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-medium">
            {items.length}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-3">
              <Camera className="w-6 h-6 text-gray-600" />
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Screenshots and findings appear here as the agent works
            </p>
          </div>
        ) : (
          <>
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
