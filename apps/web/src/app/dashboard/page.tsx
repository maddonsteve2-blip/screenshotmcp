import { auth } from "@clerk/nextjs/server";
import { eq, count, and, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, usageEvents, apiKeys } from "@screenshotsmcp/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Key, Zap } from "lucide-react";
import { PLAN_LIMITS } from "@screenshotsmcp/types";

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId!));

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [usageRow] = user
    ? await db
        .select({ count: count() })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.userId, user.id),
            gte(usageEvents.createdAt, startOfMonth)
          )
        )
    : [{ count: 0 }];

  const [keyRow] = user
    ? await db
        .select({ count: count() })
        .from(apiKeys)
        .where(and(eq(apiKeys.userId, user.id), eq(apiKeys.revoked, false)))
    : [{ count: 0 }];

  const plan = (user?.plan ?? "free") as "free" | "starter" | "pro";
  const limit = PLAN_LIMITS[plan].screenshotsPerMonth;
  const used = usageRow?.count ?? 0;
  const pct = Math.min(100, Math.round((used / limit) * 100));

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-muted-foreground">Your ScreenshotsMCP dashboard</p>
        </div>
        <Badge variant="secondary" className="capitalize">{plan} plan</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Screenshots this month</CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{used.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">of {limit.toLocaleString()} included</p>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active API keys</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{keyRow?.count ?? 0}</div>
            <p className="text-xs text-muted-foreground">keys in use</p>
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
              ${PLAN_LIMITS[plan].price}/mo
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick start</CardTitle>
          <CardDescription>Use your API key to take screenshots via REST or MCP</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">REST API</p>
            <pre className="rounded-md bg-muted p-4 text-sm overflow-x-auto">
              <code>{`curl -X POST ${process.env.NEXT_PUBLIC_API_URL}/v1/screenshot \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'`}</code>
            </pre>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">MCP (Claude Desktop / Cursor / Windsurf)</p>
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
