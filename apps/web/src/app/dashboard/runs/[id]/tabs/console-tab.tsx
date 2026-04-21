"use client";

import { useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatEventTime } from "../run-detail-utils";
import type { ConsoleEntry } from "../run-detail-types";

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      className="h-7 shrink-0 px-2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* no-op */
        }
      }}
      aria-label={label}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

export type ConsoleLevel = "all" | "error" | "warning" | "exception" | "log";

const LEVELS: readonly ConsoleLevel[] = ["all", "error", "warning", "exception", "log"] as const;

type Props = {
  consoleQuery: string;
  onConsoleQueryChange: (value: string) => void;
  consoleLevel: ConsoleLevel;
  onConsoleLevelChange: (level: ConsoleLevel) => void;
  filteredConsoleLogs: ConsoleEntry[];
  totalConsoleLogs: number;
  errorCount: number;
  warningCount: number;
};

export function ConsoleTab({
  consoleQuery,
  onConsoleQueryChange,
  consoleLevel,
  onConsoleLevelChange,
  filteredConsoleLogs,
  totalConsoleLogs,
  errorCount,
  warningCount,
}: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Console activity</CardTitle>
          <CardDescription>Search, filter, and review persisted or live console output for this run.</CardDescription>
        </div>
        {filteredConsoleLogs.length > 0 && (
          <CopyButton
            value={filteredConsoleLogs
              .map((e) => `[${e.level}] ${formatEventTime(e.ts)} ${e.text}`)
              .join("\n")}
            label="Copy all console events"
          />
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={consoleQuery}
              onChange={(event) => onConsoleQueryChange(event.target.value)}
              placeholder="Search console messages"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((level) => (
              <Button
                key={level}
                type="button"
                size="sm"
                variant={consoleLevel === level ? "default" : "outline"}
                onClick={() => onConsoleLevelChange(level)}
                className="capitalize"
              >
                {level}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Showing {filteredConsoleLogs.length} of {totalConsoleLogs} console events</span>
          <span>{errorCount} errors</span>
          <span>{warningCount} warnings</span>
        </div>

        {filteredConsoleLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
            No console events matched the current filters.
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <div className="hidden md:grid grid-cols-[110px_170px_minmax(0,1fr)_44px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Level</span>
              <span>Timestamp</span>
              <span>Message</span>
              <span className="text-right">Copy</span>
            </div>
            <div className="max-h-[640px] overflow-auto divide-y">
              {filteredConsoleLogs.map((entry, index) => (
                <div
                  key={`${entry.ts}-${index}`}
                  className="flex flex-col gap-2 px-4 py-3 text-sm md:grid md:grid-cols-[110px_170px_minmax(0,1fr)_44px] md:items-start md:gap-4"
                >
                  <div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        (entry.level === "error" || entry.level === "exception") && "border-destructive/30 text-destructive",
                      )}
                    >
                      {entry.level}
                    </Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">{formatEventTime(entry.ts)}</span>
                  <pre className="min-w-0 whitespace-pre-wrap break-words text-sm font-mono">{entry.text}</pre>
                  <div className="md:flex md:justify-end">
                    <CopyButton value={entry.text} label="Copy message" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
