"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, Pie, PieChart, LabelList, RadialBar, RadialBarChart } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Camera, TrendingUp, CheckCircle, Calendar, Zap, ArrowUpRight, RefreshCw, Wifi, WifiOff, LayoutDashboard, ListVideo, FolderSearch } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-fetch";
import { PageContainer } from "@/components/page-container";

type PlanData = {
  name: string;
  screenshotsPerMonth: number;
  price: number;
  used: number;
  remaining: number;
};

type AnalyticsData = {
  plan: PlanData;
  stats: { total: number; thisMonth: number; today: number; successRate: number };
  daily: { day: string; count: number }[];
  topUrls: { url: string; count: number }[];
  formats: { format: string; count: number }[];
  devices: { mobile: number; tablet: number; desktop: number };
};

const dailyChartConfig = {
  screenshots: {
    label: "Screenshots",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const deviceChartConfig = {
  count: { label: "Count" },
  desktop: { label: "Desktop", color: "var(--chart-1)" },
  tablet: { label: "Tablet", color: "var(--chart-2)" },
  mobile: { label: "Mobile", color: "var(--chart-3)" },
} satisfies ChartConfig;

const PLAN_LABELS: Record<string, { label: string }> = {
  free: { label: "Free" },
  starter: { label: "Starter" },
  pro: { label: "Pro" },
};

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const isUnlimited = limit > 100000;
  const pct = isUnlimited ? Math.min((used / 1000) * 100, 100) : Math.min((used / limit) * 100, 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 bg-primary"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{used.toLocaleString()} used</span>
        <span>{isUnlimited ? "Unlimited" : `${limit.toLocaleString()} limit`}</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let disposed = false;

    const connectWs = async () => {
      try {
        const res = await apiFetch("/api/analytics-ws-token");
        if (!res.ok) {
          const fallback = await apiFetch("/api/analytics");
          if (!disposed && fallback.ok) setData(await fallback.json());
          if (!disposed) setLoading(false);
          return;
        }
        const { wsUrl } = await res.json();
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!disposed) setConnected(true);
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (!disposed && msg.type === "analytics") {
              setData(msg.data);
              setLoading(false);
              setRefreshing(false);
            }
          } catch {}
        };
        ws.onclose = () => {
          if (disposed) return;
          setConnected(false);
          wsRef.current = null;
          reconnectTimerRef.current = setTimeout(() => {
            void connectWs();
          }, 5000);
        };
        ws.onerror = () => ws.close();
      } catch {
        try {
          const fallback = await apiFetch("/api/analytics");
          if (!disposed && fallback.ok) setData(await fallback.json());
        } catch {}
        if (!disposed) setLoading(false);
      }
    };

    void connectWs();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  const handleRefresh = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setRefreshing(true);
      wsRef.current.send(JSON.stringify({ type: "refresh" }));
    } else {
      setRefreshing(true);
      apiFetch("/api/analytics")
        .then((r) => r.json())
        .then((d) => { setData(d); setRefreshing(false); })
        .catch(() => setRefreshing(false));
    }
  };

  const dailyChartData = useMemo(() =>
    (data?.daily ?? []).map((d) => ({
      date: d.day,
      screenshots: d.count,
    })),
    [data?.daily]
  );

  const formatChartConfig = useMemo(() => {
    const config: ChartConfig = { count: { label: "Count" } };
    (data?.formats ?? []).forEach((f, i) => {
      config[f.format] = { label: f.format.toUpperCase(), color: `var(--chart-${i + 1})` };
    });
    return config;
  }, [data?.formats]);

  const formatChartData = useMemo(() =>
    (data?.formats ?? []).map((f) => ({
      name: f.format,
      count: f.count,
      fill: `var(--color-${f.format})`,
    })),
    [data?.formats]
  );

  const deviceChartData = !data?.devices
    ? []
    : [
        { name: "desktop", count: data.devices.desktop, fill: "var(--color-desktop)" },
        { name: "tablet", count: data.devices.tablet, fill: "var(--color-tablet)" },
        { name: "mobile", count: data.devices.mobile, fill: "var(--color-mobile)" },
      ].filter((d) => d.count > 0);

  if (loading) {
    return (
      <PageContainer width="data" className="flex flex-col gap-6">
        <div>
          <div className="h-7 w-32 bg-muted animate-pulse rounded mb-2" />
          <div className="h-4 w-56 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-24 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}
        </div>
        <div className="h-[300px] bg-muted animate-pulse rounded-lg" />
      </PageContainer>
    );
  }

  const plan = data?.plan ?? { name: "free", screenshotsPerMonth: 999999, price: 0, used: 0, remaining: 999999 };
  const planInfo = PLAN_LABELS[plan.name] ?? PLAN_LABELS.free;
  const stats = data?.stats ?? { total: 0, thisMonth: 0, today: 0, successRate: 100 };
  const deviceTotal = (data?.devices.mobile ?? 0) + (data?.devices.tablet ?? 0) + (data?.devices.desktop ?? 0);
  const totalDaily = dailyChartData.reduce((a, b) => a + b.screenshots, 0);

  return (
    <PageContainer width="data" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usage</h1>
          <p className="text-muted-foreground mt-1">Secondary analytics surface for volume, throughput, and output mix. Use Overview and Runs for operational review.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {connected ? <Wifi className="size-3.5 text-green-500" /> : <WifiOff className="size-3.5 text-muted-foreground" />}
            <span>{connected ? "Live" : "Offline"}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw data-icon="inline-start" className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Keep review workflows summary-first</p>
            <p className="text-sm text-muted-foreground">
              Usage helps you spot volume trends and output mix. It should support, not replace, the main review flow through Overview, Runs, and Artifacts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" />
                Overview
              </Button>
            </Link>
            <Link href="/dashboard/runs">
              <Button variant="outline" size="sm">
                <ListVideo className="mr-1.5 h-3.5 w-3.5" />
                Runs
              </Button>
            </Link>
            <Link href="/dashboard/artifacts">
              <Button variant="outline" size="sm">
                <FolderSearch className="mr-1.5 h-3.5 w-3.5" />
                Artifacts
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="size-5 text-primary" />
              <div>
                <CardTitle className="flex items-center gap-2">
                  Monthly Usage
                  <Badge variant="secondary">{planInfo.label} Plan</Badge>
                </CardTitle>
                <CardDescription>
                  {plan.used.toLocaleString()} of {plan.screenshotsPerMonth > 100000 ? "unlimited" : plan.screenshotsPerMonth.toLocaleString()} screenshots this month
                </CardDescription>
              </div>
            </div>
            {plan.name === "free" && (
              <Link
                href="/dashboard/billing"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Upgrade <ArrowUpRight className="size-3" />
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <UsageBar used={plan.used} limit={plan.screenshotsPerMonth} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Camera className="size-4" />
              Total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="size-4" />
              This month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.thisMonth.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="size-4" />
              Today
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.today.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle className="size-4" />
              Success rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.successRate}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily volume</CardTitle>
          <CardDescription>Last 30 days of capture output volume — {totalDaily.toLocaleString()} total screenshots</CardDescription>
        </CardHeader>
        <CardContent>
          {totalDaily > 0 ? (
            <ChartContainer config={dailyChartConfig} className="aspect-auto h-[250px] w-full">
              <BarChart accessibilityLayer data={dailyChartData} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tickFormatter={(value) => {
                    const date = new Date(value + "T00:00:00");
                    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      className="w-[160px]"
                      nameKey="screenshots"
                      labelFormatter={(value) => {
                        return new Date(value + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        });
                      }}
                    />
                  }
                />
                <Bar dataKey="screenshots" fill="var(--color-screenshots)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
              No usage data yet
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top URLs</CardTitle>
            <CardDescription>Most frequently captured domains across your workflows</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.topUrls.length ? (
              <div className="flex flex-col gap-2">
                {data.topUrls.map((u, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
                    <span className="flex-1 text-sm truncate" title={u.url}>{u.url}</span>
                    <Badge variant="secondary">{u.count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No screenshots yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Device Breakdown</CardTitle>
            <CardDescription>Capture volume by viewport size</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
            {deviceTotal > 0 ? (
              <ChartContainer config={deviceChartConfig} className="mx-auto aspect-square max-h-[250px]">
                <RadialBarChart data={deviceChartData} startAngle={-90} endAngle={380} innerRadius={30} outerRadius={110}>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="name" />} />
                  <RadialBar dataKey="count" background>
                    <LabelList
                      position="insideStart"
                      dataKey="name"
                      className="fill-white capitalize mix-blend-luminosity"
                      fontSize={11}
                    />
                  </RadialBar>
                </RadialBarChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
            )}
          </CardContent>
          {deviceTotal > 0 && (
            <CardFooter className="flex justify-center gap-4 text-xs text-muted-foreground">
              {deviceChartData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: `var(--color-${d.name})` }} />
                  <span className="capitalize">{d.name}</span>
                  <span className="font-medium text-foreground">{Math.round((d.count / deviceTotal) * 100)}%</span>
                </div>
              ))}
            </CardFooter>
          )}
        </Card>
      </div>

      {(data?.formats ?? []).length > 0 && (
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Format Breakdown</CardTitle>
            <CardDescription>Output mix across image and document artifact formats</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
            <ChartContainer config={formatChartConfig} className="mx-auto aspect-square max-h-[250px]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie data={formatChartData} dataKey="count" nameKey="name" innerRadius={50} strokeWidth={4}>
                  <LabelList
                    dataKey="name"
                    className="fill-background text-xs uppercase font-medium"
                    stroke="none"
                    fontSize={11}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
          <CardFooter className="flex justify-center gap-4 text-xs text-muted-foreground">
            {formatChartData.map((f) => (
              <div key={f.name} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: `var(--color-${f.name})` }} />
                <span className="uppercase">{f.name}</span>
                <span className="font-medium text-foreground">{f.count}</span>
              </div>
            ))}
          </CardFooter>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How to use this page</CardTitle>
          <CardDescription>Keep analytics in its supporting role inside the broader run-centric workflow.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Use Overview to see what ran recently and what needs attention.</p>
          <p>Use Runs to understand what happened inside a specific execution.</p>
          <p>Use Artifacts to locate a specific screenshot or replay after you already know which run matters.</p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
