"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Key, Zap, Download, ArrowRight } from "lucide-react";
import { PLAN_LIMITS } from "@screenshotsmcp/types";
import { InstallDialog } from "@/components/install-dialog";

interface DashboardData {
  usage: number;
  limit: number;
  keyCount: number;
  plan: "free" | "starter" | "pro";
  apiUrl: string;
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  
  const { usage, limit, keyCount, plan, apiUrl } = data;
  const pct = Math.min(100, Math.round((usage / limit) * 100));

  return (
    <>
      <div className="p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Overview</h1>
            <p className="text-muted-foreground">Your ScreenshotsMCP dashboard</p>
          </div>
          <Badge variant="secondary" className="capitalize">{plan} plan</Badge>
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
                    <p className="font-semibold">Get started — install screenshotsmcp in your IDE</p>
                    <p className="text-sm text-muted-foreground">Create an API key and add it to Cursor, Windsurf, Claude, or VS Code in 30 seconds.</p>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Screenshots this month</CardTitle>
              <Camera className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usage.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">of {limit >= 999999 ? "unlimited" : limit.toLocaleString()} included</p>
              {limit < 999999 && (
                <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}
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

        <Card>
          <CardHeader>
            <CardTitle>Quick start</CardTitle>
            <CardDescription>
              Use your API key to take screenshots via REST or MCP.{" "}
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
              <p className="text-sm font-medium mb-2">Sync REST API (returns URL directly)</p>
              <pre className="rounded-md bg-muted p-4 text-sm overflow-x-auto">
                <code>{`curl -X POST "${apiUrl}/v1/screenshot?sync=true" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
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
