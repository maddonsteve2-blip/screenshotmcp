"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Webhook,
  Plus,
  Send,
  RotateCw,
  Trash2,
  Copy,
  Check,
  Power,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Endpoint {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  lastDeliveredAt: string | null;
  lastFailureAt: string | null;
  secret?: string;
}

interface Delivery {
  id: string;
  endpointId: string;
  eventType: string;
  status: string;
  attempt: number;
  responseCode: number | null;
  errorMessage: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

const ALL_EVENTS = [
  "screenshot.completed",
  "screenshot.failed",
  "run.completed",
  "run.failed",
  "quota.warning",
  "test.ping",
];

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function statusTone(status: string): string {
  if (status === "success") return "text-emerald-400";
  if (status === "exhausted") return "text-rose-400";
  if (status === "failed") return "text-amber-400";
  return "text-muted-foreground";
}

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{ endpointId: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createUrl, setCreateUrl] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createEvents, setCreateEvents] = useState<string[]>(["*"]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  async function loadEndpoints() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/outbound-webhooks", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Failed (HTTP ${res.status})`);
        setEndpoints([]);
      } else {
        setEndpoints(data.endpoints ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEndpoints();
  }, []);

  async function loadDeliveries(endpointId: string) {
    setSelectedEndpoint(endpointId);
    setLoadingDeliveries(true);
    try {
      const res = await apiFetch(`/api/outbound-webhooks/${endpointId}/deliveries?limit=50`, {
        cache: "no-store",
      });
      const data = await res.json();
      setDeliveries(data.deliveries ?? []);
    } catch {
      setDeliveries([]);
    } finally {
      setLoadingDeliveries(false);
    }
  }

  function toggleCreateEvent(event: string) {
    setCreateEvents((current) => {
      if (event === "*") return ["*"];
      const without = current.filter((e) => e !== "*");
      if (without.includes(event)) {
        const next = without.filter((e) => e !== event);
        return next.length === 0 ? ["*"] : next;
      }
      return [...without, event];
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createUrl.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/outbound-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: createUrl.trim(),
          events: createEvents,
          description: createDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.formErrors?.[0] ?? data?.error ?? `Failed (HTTP ${res.status})`);
      } else {
        const ep: Endpoint = data.endpoint;
        if (ep.secret) {
          setRevealedSecret({ endpointId: ep.id, secret: ep.secret });
        }
        setCreateUrl("");
        setCreateDescription("");
        setCreateEvents(["*"]);
        await loadEndpoints();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleRotate(id: string) {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/outbound-webhooks/${id}/rotate`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.endpoint?.secret) {
        setRevealedSecret({ endpointId: id, secret: data.endpoint.secret });
      }
      await loadEndpoints();
    } finally {
      setBusyId(null);
    }
  }

  async function handleTest(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/outbound-webhooks/${id}/test`, { method: "POST" });
      await loadDeliveries(id);
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(ep: Endpoint) {
    setBusyId(ep.id);
    try {
      await apiFetch(`/api/outbound-webhooks/${ep.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !ep.enabled }),
      });
      await loadEndpoints();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirmDialog({
      title: "Delete this webhook endpoint?",
      description: "Outgoing events will stop immediately. This cannot be undone.",
      confirmLabel: "Delete endpoint",
      variant: "destructive",
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/outbound-webhooks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      if (selectedEndpoint === id) {
        setSelectedEndpoint(null);
        setDeliveries([]);
      }
      await loadEndpoints();
      toast.success("Webhook deleted");
    } catch (err) {
      toast.error("Could not delete webhook", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusyId(null);
    }
  }

  function copySecret(secret: string) {
    void navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const sortedEndpoints = useMemo(
    () => [...endpoints].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [endpoints],
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Webhook className="h-6 w-6" /> Webhooks
          </h1>
          <p className="text-sm text-muted-foreground">
            HMAC-signed events delivered to your servers.{" "}
            <Link href="/docs/api/webhooks" className="underline">
              Read the docs
            </Link>
            .
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadEndpoints()} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
        </Button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {revealedSecret && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="text-base">Signing secret — store it now</CardTitle>
            <CardDescription>
              This secret is shown only once. Save it in your secrets manager before navigating
              away.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-black/40 px-3 py-2 text-xs">
                {revealedSecret.secret}
              </code>
              <Button size="sm" variant="outline" onClick={() => copySecret(revealedSecret.secret)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setRevealedSecret(null)}>
              I&apos;ve saved it
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add an endpoint</CardTitle>
          <CardDescription>We&apos;ll POST signed JSON to this URL.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">URL</Label>
              <Input
                id="webhook-url"
                placeholder="https://example.com/hooks/screenshotsmcp"
                value={createUrl}
                onChange={(e) => setCreateUrl(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-description">Description (optional)</Label>
              <Input
                id="webhook-description"
                placeholder="Production prod hooks"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleCreateEvent("*")}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    createEvents.includes("*")
                      ? "border-primary bg-primary/20 text-foreground"
                      : "border-white/10 text-muted-foreground hover:border-white/30"
                  }`}
                >
                  All events
                </button>
                {ALL_EVENTS.map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggleCreateEvent(ev)}
                    disabled={createEvents.includes("*")}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40 ${
                      createEvents.includes(ev)
                        ? "border-primary bg-primary/20 text-foreground"
                        : "border-white/10 text-muted-foreground hover:border-white/30"
                    }`}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={creating || !createUrl.trim()}>
              <Plus className="h-4 w-4" /> {creating ? "Creating…" : "Create endpoint"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Endpoints</CardTitle>
          <CardDescription>
            {loading
              ? "Loading…"
              : sortedEndpoints.length === 0
                ? "No endpoints yet. Create one above to start receiving events."
                : `${sortedEndpoints.length} endpoint${sortedEndpoints.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedEndpoints.map((ep) => {
            const isSelected = selectedEndpoint === ep.id;
            return (
              <div
                key={ep.id}
                className={`rounded-lg border p-4 transition-colors ${
                  isSelected ? "border-primary/40 bg-primary/5" : "border-white/[0.06]"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="truncate text-sm font-medium">{ep.url}</code>
                      {ep.enabled ? (
                        <Badge variant="default">Enabled</Badge>
                      ) : (
                        <Badge variant="outline">Paused</Badge>
                      )}
                    </div>
                    {ep.description && (
                      <p className="text-xs text-muted-foreground">{ep.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1 text-xs">
                      {ep.events.map((e) => (
                        <span
                          key={e}
                          className="rounded-full bg-white/5 px-2 py-0.5 text-muted-foreground"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last delivered {formatDate(ep.lastDeliveredAt)} · last failure{" "}
                      {formatDate(ep.lastFailureAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void loadDeliveries(ep.id)}
                      disabled={busyId === ep.id}
                    >
                      Deliveries
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleTest(ep.id)}
                      disabled={busyId === ep.id}
                    >
                      <Send className="h-4 w-4" /> Test
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleToggle(ep)}
                      disabled={busyId === ep.id}
                    >
                      <Power className="h-4 w-4" /> {ep.enabled ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRotate(ep.id)}
                      disabled={busyId === ep.id}
                    >
                      <RotateCw className="h-4 w-4" /> Rotate secret
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-400"
                      onClick={() => void handleDelete(ep.id)}
                      disabled={busyId === ep.id}
                      aria-label="Delete webhook endpoint"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-4 border-t border-white/[0.06] pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Recent deliveries
                    </p>
                    {loadingDeliveries ? (
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    ) : deliveries.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No deliveries yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {deliveries.map((d) => (
                          <div
                            key={d.id}
                            className="flex flex-wrap items-center gap-3 rounded border border-white/[0.04] bg-black/20 px-3 py-2 text-xs"
                          >
                            <span className="font-mono">{d.eventType}</span>
                            <span className={statusTone(d.status)}>
                              {d.status}
                              {d.responseCode ? ` · ${d.responseCode}` : ""}
                              {d.attempt > 1 ? ` · attempt ${d.attempt}` : ""}
                            </span>
                            <span className="text-muted-foreground">{formatDate(d.createdAt)}</span>
                            {d.errorMessage && (
                              <span className="truncate text-rose-300/70">{d.errorMessage}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
