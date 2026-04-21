"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type RunSummaryInput = {
  runId: string;
  pageTitle: string | null;
  startUrl: string | null;
  finalUrl: string | null;
  status: string;
  executionMode: string;
  recordingEnabled: boolean;
  viewportWidth: number | null;
  viewportHeight: number | null;
  startedAt: string | null;
  endedAt: string | null;
  consoleLogCount: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  networkRequestCount: number;
  networkErrorCount: number;
  captureCount: number;
  recordingCount: number;
  shareUrl?: string | null;
  outcomeSummary?: string | null;
  outcomeVerdict?: string | null;
};

function durationText(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.round((end - start) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function buildMarkdown(run: RunSummaryInput): string {
  const title = run.pageTitle || run.startUrl || "Browser run";
  const url = run.finalUrl || run.startUrl || "(no URL)";
  const lines: string[] = [];
  lines.push(`# Run: ${title}`);
  lines.push("");
  lines.push(`- **URL:** ${url}`);
  lines.push(`- **Status:** ${run.status}${run.outcomeVerdict ? ` (${run.outcomeVerdict})` : ""}`);
  lines.push(`- **Mode:** ${run.executionMode}`);
  lines.push(`- **Session ID:** \`${run.runId}\``);
  if (run.startedAt) lines.push(`- **Started:** ${new Date(run.startedAt).toISOString()}`);
  lines.push(`- **Duration:** ${durationText(run.startedAt, run.endedAt)}`);
  lines.push(`- **Viewport:** ${run.viewportWidth ?? "?"}×${run.viewportHeight ?? "?"}`);
  lines.push(`- **Recording enabled:** ${run.recordingEnabled ? "yes" : "no"}`);
  lines.push(`- **Captures:** ${run.captureCount} · **Replays:** ${run.recordingCount}`);
  lines.push(`- **Console:** ${run.consoleLogCount} events (${run.consoleErrorCount} errors, ${run.consoleWarningCount} warnings)`);
  lines.push(`- **Network:** ${run.networkRequestCount} requests (${run.networkErrorCount} failed)`);
  if (run.shareUrl) lines.push(`- **Public share link:** ${run.shareUrl}`);
  if (run.outcomeSummary) {
    lines.push("");
    lines.push("## Summary");
    lines.push(run.outcomeSummary);
  }
  lines.push("");
  lines.push(`_Generated from ScreenshotsMCP dashboard_`);
  return lines.join("\n");
}

function buildJson(run: RunSummaryInput): string {
  return JSON.stringify(run, null, 2);
}

export function RunCopyMarkdownButton({ run }: { run: RunSummaryInput }) {
  const [copied, setCopied] = useState<null | "md" | "json" | "url">(null);

  const doCopy = async (kind: "md" | "json" | "url") => {
    let text = "";
    if (kind === "md") text = buildMarkdown(run);
    else if (kind === "json") text = buildJson(run);
    else if (kind === "url") text = typeof window !== "undefined" ? window.location.href : "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* no-op */
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        {copied ? (
          <>
            <Check className="mr-2 h-4 w-4" /> Copied
          </>
        ) : (
          <>
            <Clipboard className="mr-2 h-4 w-4" /> Copy for sharing
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => void doCopy("md")}>
          Copy as Markdown
          <span className="ml-auto text-xs text-muted-foreground">AI prompt</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void doCopy("json")}>
          Copy as JSON
          <span className="ml-auto text-xs text-muted-foreground">Structured</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void doCopy("url")}>
          Copy page URL
          <span className="ml-auto text-xs text-muted-foreground">Dashboard</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
