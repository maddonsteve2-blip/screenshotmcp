import { auth } from "@clerk/nextjs/server";
import { eq, count, and, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { usageEvents, apiKeys } from "@screenshotsmcp/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Camera, Key, Zap, Download, ArrowRight } from "lucide-react";
import { PLAN_LIMITS } from "@screenshotsmcp/types";
import Link from "next/link";

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  const db = getDb();
  const user = await getOrCreateDbUser(clerkId!);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [usageRow] = user
    ? await db.select({ count: count() }).from(usageEvents).where(and(eq(usageEvents.userId, user.id), gte(usageEvents.createdAt, startOfMonth)))
    : [{ count: 0 }];

  const [keyRow] = user
    ? await db.select({ count: count() }).from(apiKeys).where(and(eq(apiKeys.userId, user.id), eq(apiKeys.revoked, false)))
    : [{ count: 0 }];

  const plan = (user?.plan ?? "free") as "free" | "starter" | "pro";
  const limit = PLAN_LIMITS[plan].screenshotsPerMonth;
  const used = usageRow?.count ?? 0;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const keyCount = keyRow?.count ?? 0;

  return (
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
              <Link href="/dashboard/install">
                <Button className="gap-2 shrink-0">
                  Install now <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
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
            <div className="text-2xl font-bold">{used.toLocaleString()}</div>
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
                <Link href="/dashboard/install" className="text-primary hover:underline">Create your first key →</Link>
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
            <Link href="/dashboard/install" className="text-primary hover:underline">Need help installing? →</Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Sync REST API (returns URL directly)</p>
            <pre className="rounded-md bg-muted p-4 text-sm overflow-x-auto">
              <code>{`curl -X POST "${process.env.NEXT_PUBLIC_API_URL}/v1/screenshot?sync=true" \\
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
      "url": "${process.env.NEXT_PUBLIC_API_URL}/mcp",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}`}</code>
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
