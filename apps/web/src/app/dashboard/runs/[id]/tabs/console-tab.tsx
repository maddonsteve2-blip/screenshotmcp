"use client";

import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatEventTime } from "../run-detail-utils";
import type { ConsoleEntry } from "../run-detail-types";

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
      <CardHeader>
        <CardTitle>Console activity</CardTitle>
        <CardDescription>Search, filter, and review persisted or live console output for this run.</CardDescription>
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
            <div className="grid grid-cols-[120px_180px_1fr] gap-4 border-b bg-muted/40 px-4 py-3 text-sm font-medium text-muted-foreground">
              <span>Level</span>
              <span>Timestamp</span>
              <span>Message</span>
            </div>
            <div className="max-h-[640px] overflow-auto divide-y">
              {filteredConsoleLogs.map((entry, index) => (
                <div key={`${entry.ts}-${index}`} className="grid grid-cols-[120px_180px_1fr] gap-4 px-4 py-3 text-sm">
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
                  <pre className="whitespace-pre-wrap break-words text-sm font-mono">{entry.text}</pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
