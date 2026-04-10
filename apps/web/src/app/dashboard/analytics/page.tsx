"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, TrendingUp, CheckCircle, Calendar, Monitor, Tablet, MonitorSmartphone } from "lucide-react";

type AnalyticsData = {
  stats: { total: number; thisMonth: number; today: number; successRate: number };
  daily: { day: string; count: number }[];
  topUrls: { url: string; count: number }[];
  formats: { format: string; count: number }[];
  devices: { mobile: number; tablet: number; desktop: number };
};

function BarChart({ data }: { data: { day: string; count: number }[] }) {
  if (!data.length) return <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>;
  const max = Math.max(...data.map((d) => d.count), 1);
  // Fill last 30 days
  const days: { label: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const found = data.find((r) => r.day === key);
    days.push({ label: d.toLocaleDateString("en", { month: "short", day: "numeric" }), count: found?.count ?? 0 });
  }
  return (
    <div className="flex items-end gap-0.5 h-32 w-full" title="Daily screenshots (last 30 days)">
      {days.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div
            className="w-full bg-primary/70 rounded-sm group-hover:bg-primary transition-colors min-h-[2px]"
            style={{ height: `${Math.max((d.count / max) * 100, d.count > 0 ? 4 : 0)}%` }}
          />
          <div className="absolute bottom-full mb-1 bg-popover border text-xs px-1.5 py-0.5 rounded shadow hidden group-hover:block whitespace-nowrap z-10">
            {d.label}: {d.count}
          </div>
        </div>
      ))}
    </div>
  );
}

function PieSlice({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, b) => a + b.value, 0);
  if (!total) return <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
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

const FORMAT_COLORS: Record<string, string> = {
  png: "#3b82f6",
  jpeg: "#f59e0b",
  webp: "#10b981",
  pdf: "#ef4444",
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div>
          <div className="h-7 w-32 bg-muted animate-pulse rounded mb-2" />
          <div className="h-4 w-56 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}
        </div>
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

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
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">Your screenshot usage at a glance</p>
      </div>

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
