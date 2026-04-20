"use client";

import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBytes, formatEventTime } from "../run-detail-utils";
import type { NetworkErrorEntry, NetworkRequestEntry } from "../run-detail-types";

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

        <div className="grid grid-cols-1 xl:grid-cols-[0.72fr_1.28fr] gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Failed requests</CardTitle>
              <CardDescription>High-signal failures captured for this run.</CardDescription>
            </CardHeader>
            <CardContent>
              {networkErrors.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No failed requests were persisted for this run.
                </div>
              ) : (
                <div className="flex max-h-[640px] flex-col gap-3 overflow-auto">
                  {networkErrors
                    .slice()
                    .sort((a, b) => b.ts - a.ts)
                    .map((entry, index) => (
                      <div key={`${entry.url}-${entry.ts}-${index}`} className="flex flex-col gap-2 rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant="outline" className="border-destructive/30 text-destructive">{entry.status}</Badge>
                          <span className="text-sm text-muted-foreground">{formatEventTime(entry.ts)}</span>
                        </div>
                        <p className="text-sm font-medium">{entry.statusText}</p>
                        <p className="text-sm text-muted-foreground break-all">{entry.url}</p>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Request activity</CardTitle>
              <CardDescription>Filtered request traffic for this run.</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredRequests.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No request activity matched the current filters.
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <div className="grid grid-cols-[90px_90px_90px_90px_90px_1fr] gap-3 border-b bg-muted/40 px-4 py-3 text-sm font-medium text-muted-foreground">
                    <span>Method</span>
                    <span>Status</span>
                    <span>Type</span>
                    <span>Duration</span>
                    <span>Size</span>
                    <span>URL</span>
                  </div>
                  <div className="max-h-[640px] overflow-auto divide-y">
                    {filteredRequests.map((entry, index) => (
                      <div key={`${entry.url}-${entry.ts}-${index}`} className="grid grid-cols-[90px_90px_90px_90px_90px_1fr] gap-3 px-4 py-3 text-sm">
                        <span className="font-medium">{entry.method}</span>
                        <span className={cn(entry.status >= 400 ? "text-destructive" : "text-foreground")}>{entry.status}</span>
                        <span className="uppercase text-muted-foreground">{entry.resourceType}</span>
                        <span>{entry.duration}ms</span>
                        <span>{formatBytes(entry.size)}</span>
                        <span className="truncate text-muted-foreground" title={entry.url}>{entry.url}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
