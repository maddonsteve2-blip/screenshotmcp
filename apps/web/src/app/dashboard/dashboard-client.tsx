"use client";

import Link from "next/link";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Key, Zap, Download, ArrowRight, Video, ExternalLink, Image as ImageIcon } from "lucide-react";
import { PLAN_LIMITS } from "@screenshotsmcp/types";
import { InstallDialog } from "@/components/install-dialog";

interface DashboardData {
  usage: number;
  limit: number;
  keyCount: number;
  recordingCount: number;
  plan: "free" | "starter" | "pro";
  apiUrl: string;
  recentScreenshots: {
    id: string;
    url: string;
    status: string;
    publicUrl: string | null;
    width: number;
    height: number | null;
    format: string;
    fullPage: boolean;
    createdAt: string;
  }[];
  recentRecordings: {
    id: string;
    pageUrl: string | null;
    durationMs: number | null;
    viewportWidth: number | null;
    viewportHeight: number | null;
    createdAt: string;
  }[];
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  
  const { usage, limit, keyCount, recordingCount, plan, apiUrl, recentScreenshots, recentRecordings } = data;
  const isUnlimited = limit >= 999999;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((usage / limit) * 100));

  return (
    <>
      <div className="p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Overview</h1>
            <p className="text-muted-foreground">Recent browser evidence, recording activity, and install status.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/runs">
              <Button variant="outline" size="sm">Open runs</Button>
            </Link>
            <Badge variant="secondary" className="capitalize">{plan} plan</Badge>
          </div>
        </div>

        {keyCount === 0 && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Download className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Connect ScreenshotsMCP to your workflow</p>
                    <p className="text-sm text-muted-foreground">Create an API key, connect MCP, and start collecting screenshots, recordings, and proof from real browser runs.</p>
                  </div>
                </div>
                <Button 
                  className="gap-2 shrink-0"
                  onClick={() => setShowInstallDialog(true)}
                >
                  Install now <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Screenshots this month</CardTitle>
              <Camera className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usage.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">of {isUnlimited ? "unlimited" : limit.toLocaleString()} included</p>
              {!isUnlimited && (
                <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Recordings this month</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recordingCount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Saved session videos and replayable evidence</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active API keys</CardTitle>
              <Key className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{keyCount}</div>
              <p className="text-xs text-muted-foreground">
                {keyCount === 0 ? (
                  <button 
                    onClick={() => setShowInstallDialog(true)}
                    className="text-primary hover:underline"
                  >
                    Create your first key →
                  </button>
                ) : "keys in use"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Plan</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{plan}</div>
              <p className="text-xs text-muted-foreground">
                {PLAN_LIMITS[plan].price === 0 ? "Free forever" : `$${PLAN_LIMITS[plan].price}/mo`}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Recent screenshots</CardTitle>
                <CardDescription>The latest captures and exports produced by your workflows.</CardDescription>
              </div>
              <Link href="/dashboard/screenshots">
                <Button variant="outline" size="sm">Open all</Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentScreenshots.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No screenshots yet. Run a browser task and your recent evidence will show up here.
                </div>
              ) : (
                recentScreenshots.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium truncate" title={item.url}>{item.url}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={item.status === "done" ? "secondary" : "outline"} className="capitalize">{item.status}</Badge>
                        <span>{item.width}×{item.height ?? "—"}</span>
                        <span>{item.format.toUpperCase()}</span>
                        {item.fullPage && <span>Full page</span>}
                        <span>{timeAgo(item.createdAt)}</span>
                      </div>
                    </div>
                    {item.publicUrl && (
                      <a href={item.publicUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Recent recordings</CardTitle>
                <CardDescription>Session replays generated from managed browser workflows.</CardDescription>
              </div>
              <Link href="/dashboard/recordings">
                <Button variant="outline" size="sm">Open all</Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentRecordings.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No recordings yet. Start a managed browser run with recording enabled to build replayable evidence.
                </div>
              ) : (
                recentRecordings.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium truncate" title={item.pageUrl ?? "Managed browser session"}>{item.pageUrl ?? "Managed browser session"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDuration(item.durationMs)}</span>
                      <span>{item.viewportWidth ?? "—"}×{item.viewportHeight ?? "—"}</span>
                      <span>{timeAgo(item.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How to get better proof</CardTitle>
            <CardDescription>
              Use your API key through REST or MCP, then escalate from captures to richer evidence when needed.{" "}
              <button 
                onClick={() => setShowInstallDialog(true)}
                className="text-primary hover:underline"
              >
                Need help installing? →
              </button>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Sync REST API (returns capture output directly)</p>
              <pre className="rounded-md bg-muted p-4 text-sm overflow-x-auto">
                <code>{`curl -X POST "${apiUrl}/v1/screenshot?sync=true" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'`}</code>
              </pre>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">MCP config (Cursor / Windsurf / Claude)</p>
              <pre className="rounded-md bg-muted p-4 text-sm overflow-x-auto">
                <code>{`{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "${apiUrl}/mcp",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}`}</code>
              </pre>
            </div>
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Start with public remote workflows for fast inspection. When the work needs localhost access, private auth, recordings, or stronger verification, use the managed local browser and export evidence bundles.
            </div>
          </CardContent>
        </Card>
      </div>

      <InstallDialog 
        isOpen={showInstallDialog} 
        onClose={() => setShowInstallDialog(false)} 
      />
    </>
  );
}
