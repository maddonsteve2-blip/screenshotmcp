"use client";

import { useState } from "react";

interface DocsCopyDownloadProps {
  slug: string;
}

export function DocsCopyDownload({ slug }: DocsCopyDownloadProps) {
  const [copied, setCopied] = useState(false);

  const getMarkdownUrl = () => {
    const path = slug ? `/docs/${slug}` : "/docs";
    return `/api/docs-markdown?path=${encodeURIComponent(path)}`;
  };

  const handleCopy = async () => {
    try {
      const res = await fetch(getMarkdownUrl());
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = getMarkdownUrl();
    a.download = `${slug ? slug.replace(/\//g, "-") : "index"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex items-center gap-2 mt-2 mb-4">
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-md border border-fd-border bg-fd-background px-3 py-1.5 text-xs font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {copied ? (
            <path d="M20 6L9 17l-5-5" />
          ) : (
            <>
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </>
          )}
        </svg>
        {copied ? "Copied!" : "Copy as Markdown"}
      </button>
      <button
        onClick={handleDownload}
        className="inline-flex items-center gap-1.5 rounded-md border border-fd-border bg-fd-background px-3 py-1.5 text-xs font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download .md
      </button>
    </div>
  );
}
