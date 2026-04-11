"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, TrendingUp, CheckCircle, Calendar, Zap, ArrowUpRight, RefreshCw, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";

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

function BarChart({ data }: { data: { day: string; count: number }[] }) {
  // Data comes pre-filled from API (30 entries, one per day) — just render directly
  const max = Math.max(...data.map((d) => d.count), 1);
  const hasData = data.some((d) => d.count > 0);

  if (!data.length || !hasData) {
    return <div className="h-36 flex items-center justify-center text-sm text-muted-foreground">No usage data yet</div>;
  }

  return (
    <div className="flex items-end gap-[3px] h-36 w-full">
      {data.map((d, i) => {
        // Parse YYYY-MM-DD to readable label
        const parts = d.day.split("-");
        const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const label = dateObj.toLocaleDateString("en", { month: "short", day: "numeric" });
        return (
          <div key={i} className="flex-1 flex flex-col items-center group relative">
            <div
              className="w-full bg-primary/60 rounded-t-sm group-hover:bg-primary transition-colors"
              style={{ height: `${Math.max((d.count / max) * 100, d.count > 0 ? 6 : 0)}%` }}
            />
            <div className="absolute bottom-full mb-1.5 bg-popover border text-xs px-2 py-1 rounded-md shadow-md hidden group-hover:block whitespace-nowrap z-10 font-medium">
              {label}: <span className="text-primary">{d.count}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PieSlice({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, b) => a + b.value, 0);
  if (!total) return <div className="h-20 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90 shrink-0">
        {segments.map((seg, i) => {
          const pct = (seg.value / total) * 100;
          const circle = (
            <circle
              key={i}
              cx="18" cy="18" r="15.9"
              fill="transparent"
              stroke={seg.color}
              strokeWidth="3.8"
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeDashoffset={-offset}
            />
          );
          offset += pct;
          return circle;
        })}
      </svg>
      <div className="space-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className="font-medium">{total > 0 ? Math.round((seg.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const isUnlimited = limit > 100000;
  const pct = isUnlimited ? Math.min((used / 1000) * 100, 100) : Math.min((used / limit) * 100, 100);
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="space-y-1.5">
      <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{used.toLocaleString()} used</span>
        <span>{isUnlimited ? "Unlimited" : `${limit.toLocaleString()} limit`}</span>
      </div>
    </div>
  );
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: "Free", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  starter: { label: "Starter", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  pro: { label: "Pro", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
};

const FORMAT_COLORS: Record<string, string> = {
  png: "#3b82f6",
  jpeg: "#f59e0b",
  webp: "#10b981",
  pdf: "#ef4444",
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connectWs = useCallback(async () => {
    try {
      // Get WebSocket URL with auth token from our API
      const res = await fetch("/api/analytics-ws-token");
      if (!res.ok) {
        // Fallback to REST if WS token fails
        const fallback = await fetch("/api/analytics");
        if (fallback.ok) {
          const d = await fallback.json();
          setData(d);
        }
        setLoading(false);
        return;
      }
      const { wsUrl } = await res.json();

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "analytics") {
            setData(msg.data);
            setLoading(false);
            setRefreshing(false);
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Reconnect after 5s
        setTimeout(connectWs, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // Fallback to REST
      try {
        const fallback = await fetch("/api/analytics");
        if (fallback.ok) setData(await fallback.json());
      } catch {}
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    connectWs();
    return () => { wsRef.current?.close(); };
  }, [connectWs]);

  const handleRefresh = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setRefreshing(true);
      wsRef.current.send(JSON.stringify({ type: "refresh" }));
    } else {
      // Fallback: re-fetch via REST
      setRefreshing(true);
      fetch("/api/analytics")
        .then((r) => r.json())
        .then((d) => { setData(d); setRefreshing(false); })
        .catch(() => setRefreshing(false));
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6 max-w-5xl">
        <div>
          <div className="h-7 w-32 bg-muted animate-pulse rounded mb-2" />
          <div className="h-4 w-56 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-24 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}
        </div>
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  const plan = data?.plan ?? { name: "free", screenshotsPerMonth: 999999, price: 0, used: 0, remaining: 999999 };
  const planInfo = PLAN_LABELS[plan.name] ?? PLAN_LABELS.free;
  const stats = data?.stats ?? { total: 0, thisMonth: 0, today: 0, successRate: 100 };
  const deviceTotal = (data?.devices.mobile ?? 0) + (data?.devices.tablet ?? 0) + (data?.devices.desktop ?? 0);

  const deviceSegments = [
    { label: "Desktop", value: data?.devices.desktop ?? 0, color: "#3b82f6" },
    { label: "Tablet", value: data?.devices.tablet ?? 0, color: "#8b5cf6" },
    { label: "Mobile", value: data?.devices.mobile ?? 0, color: "#f59e0b" },
  ];
  const formatSegments = (data?.formats ?? []).map((f) => ({
    label: f.format.toUpperCase(),
    value: f.count,
    color: FORMAT_COLORS[f.format] ?? "#6b7280",
  }));

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">Your screenshot usage at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {connected ? <Wifi className="h-3.5 w-3.5 text-green-500" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
            <span>{connected ? "Live" : "Offline"}</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Plan & Usage */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-primary" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Monthly Usage</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${planInfo.color}`}>{planInfo.label} Plan</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {plan.used.toLocaleString()} of {plan.screenshotsPerMonth > 100000 ? "unlimited" : plan.screenshotsPerMonth.toLocaleString()} screenshots this month
                </p>
              </div>
            </div>
            {plan.name === "free" && (
              <Link
                href="/dashboard/billing"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Upgrade <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          <UsageBar used={plan.used} limit={plan.screenshotsPerMonth} />
        </CardContent>
      </Card>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <Camera className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <p className="text-3xl font-bold">{stats.total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">This month</span>
            </div>
            <p className="text-3xl font-bold">{stats.thisMonth.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Today</span>
            </div>
            <p className="text-3xl font-bold">{stats.today.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Success rate</span>
            </div>
            <p className="text-3xl font-bold">{stats.successRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily Usage (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart data={data?.daily ?? []} />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top URLs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top URLs</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.topUrls.length ? (
              <div className="space-y-2">
                {data.topUrls.map((u, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
                    <span className="flex-1 text-xs truncate" title={u.url}>{u.url}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">{u.count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No screenshots yet</p>
            )}
          </CardContent>
        </Card>

        {/* Device + Format breakdown */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Device Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {deviceTotal > 0 ? (
                <PieSlice segments={deviceSegments} />
              ) : (
                <p className="text-sm text-muted-foreground py-2 text-center">No data yet</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Format Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {formatSegments.length > 0 ? (
                <PieSlice segments={formatSegments} />
              ) : (
                <p className="text-sm text-muted-foreground py-2 text-center">No data yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
