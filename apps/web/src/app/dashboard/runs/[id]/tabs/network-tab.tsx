"use client";

import { useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBytes, formatEventTime } from "../run-detail-utils";
import type { NetworkErrorEntry, NetworkRequestEntry } from "../run-detail-types";

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

export type NetworkScope = "all" | "failed";

type Props = {
  networkQuery: string;
  onNetworkQueryChange: (value: string) => void;
  networkScope: NetworkScope;
  onNetworkScopeChange: (scope: NetworkScope) => void;
  networkType: string;
  onNetworkTypeChange: (type: string) => void;
  availableNetworkTypes: string[];
  filteredRequests: NetworkRequestEntry[];
  totalRequests: number;
  failedCount: number;
  networkErrors: NetworkErrorEntry[];
};

export function NetworkTab({
  networkQuery,
  onNetworkQueryChange,
  networkScope,
  onNetworkScopeChange,
  networkType,
  onNetworkTypeChange,
  availableNetworkTypes,
  filteredRequests,
  totalRequests,
  failedCount,
  networkErrors,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Network activity</CardTitle>
        <CardDescription>Search and filter request traffic for failed calls, resource classes, and URLs.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={networkQuery}
              onChange={(event) => onNetworkQueryChange(event.target.value)}
              placeholder="Search URLs, status, method"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={networkScope === "all" ? "default" : "outline"} onClick={() => onNetworkScopeChange("all")}>
              All requests
            </Button>
            <Button type="button" size="sm" variant={networkScope === "failed" ? "default" : "outline"} onClick={() => onNetworkScopeChange("failed")}>
              Failed only
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {availableNetworkTypes.map((type) => (
            <Button
              key={type}
              type="button"
              size="sm"
              variant={networkType === type ? "default" : "outline"}
              onClick={() => onNetworkTypeChange(type)}
              className="capitalize"
            >
              {type === "all" ? "All types" : type}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Showing {filteredRequests.length} of {totalRequests} requests</span>
          <span>{failedCount} failed</span>
        </div>

        {networkErrors.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Failed requests</CardTitle>
                <CardDescription>High-signal failures captured for this run.</CardDescription>
              </div>
              <CopyButton
                value={networkErrors
                  .slice()
                  .sort((a, b) => b.ts - a.ts)
                  .map((e) => `${e.status} ${e.statusText} — ${e.url}`)
                  .join("\n")}
                label="Copy all failures"
              />
            </CardHeader>
            <CardContent>
              <div className="flex max-h-[480px] flex-col gap-3 overflow-auto">
                {networkErrors
                  .slice()
                  .sort((a, b) => b.ts - a.ts)
                  .map((entry, index) => (
                    <div key={`${entry.url}-${entry.ts}-${index}`} className="flex flex-col gap-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-destructive/30 text-destructive">{entry.status}</Badge>
                          <span className="text-sm font-medium">{entry.statusText}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{formatEventTime(entry.ts)}</span>
                          <CopyButton value={entry.url} label="Copy URL" />
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground break-all">{entry.url}</p>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Request activity</CardTitle>
              <CardDescription>Filtered request traffic for this run. Click the copy icon on any row to grab the URL.</CardDescription>
            </div>
            {filteredRequests.length > 0 && (
              <CopyButton
                value={filteredRequests
                  .map((e) => `${e.method} ${e.status} ${e.resourceType.toUpperCase()} ${e.duration}ms ${formatBytes(e.size)} ${e.url}`)
                  .join("\n")}
                label="Copy all rows"
              />
            )}
          </CardHeader>
          <CardContent>
            {filteredRequests.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No request activity matched the current filters.
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <div className="hidden md:grid grid-cols-[70px_60px_80px_80px_80px_minmax(0,1fr)_44px] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Method</span>
                  <span>Status</span>
                  <span>Type</span>
                  <span>Duration</span>
                  <span>Size</span>
                  <span>URL</span>
                  <span className="text-right">Copy</span>
                </div>
                <div className="max-h-[640px] overflow-auto divide-y">
                  {filteredRequests.map((entry, index) => (
                    <div
                      key={`${entry.url}-${entry.ts}-${index}`}
                      className="flex flex-col gap-1 px-4 py-3 text-sm md:grid md:grid-cols-[70px_60px_80px_80px_80px_minmax(0,1fr)_44px] md:items-center md:gap-3"
                    >
                      <span className="font-medium">{entry.method}</span>
                      <span className={cn(entry.status >= 400 ? "text-destructive" : "text-foreground")}>{entry.status}</span>
                      <span className="uppercase text-muted-foreground">{entry.resourceType}</span>
                      <span className="text-muted-foreground">{entry.duration}ms</span>
                      <span className="text-muted-foreground">{formatBytes(entry.size)}</span>
                      <span className="min-w-0 break-all text-muted-foreground md:truncate" title={entry.url}>{entry.url}</span>
                      <div className="md:flex md:justify-end">
                        <CopyButton value={entry.url} label="Copy URL" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
