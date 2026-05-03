"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, RefreshCw, Trash2, Key, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { PageContainer } from "@/components/page-container";

interface ActiveKey {
  id: string;
  name: string;
  keyPreview: string;
  lastUsed: string | null;
  createdAt: string;
}

export default function KeysPage() {
  const [activeKey, setActiveKey] = useState<ActiveKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [acting, setActing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function fetchKey() {
    const res = await apiFetch("/api/keys");
    const data = await res.json();
    setActiveKey(data.key ?? null);
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => {
      void fetchKey();
    });
  }, []);

  async function createKey() {
    setActing(true);
    const res = await apiFetch("/api/keys", { method: "POST" });
    const data = await res.json();
    if (data.existing) {
      // Already have one — just refresh
      await fetchKey();
    } else if (data.key) {
      setRawKey(data.key);
      await fetchKey();
    }
    setActing(false);
  }

  async function rollKey() {
    setActing(true);
    const res = await apiFetch("/api/keys", { method: "PUT" });
    const data = await res.json();
    if (data.key) {
      setRawKey(data.key);
      await fetchKey();
    }
    setActing(false);
  }

  async function deleteKey() {
    if (!activeKey) return;
    setActing(true);
    await apiFetch(`/api/keys/${activeKey.id}`, { method: "DELETE" });
    setActiveKey(null);
    setRawKey(null);
    setConfirmDelete(false);
    setActing(false);
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <PageContainer width="text">
        <h1 className="text-2xl font-bold mb-2">API Key</h1>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="text" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Key</h1>
        <p className="text-muted-foreground mt-1">
          Your REST API key. MCP and CLI access must be authorized with website sign-in.
        </p>
      </div>

      {/* Show raw key banner when just created/rolled */}
      {rawKey && (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              Copy your API key now — it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-white dark:bg-gray-900 border px-3 py-2 text-sm font-mono break-all">
                {rawKey}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={() => copyToClipboard(rawKey)}
                aria-label={copied ? "Copied" : "Copy API key"}
              >
                {copied ? <Check className="h-4 w-4 text-green-500" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setRawKey(null)}>
              I&apos;ve copied it
            </Button>
          </CardContent>
        </Card>
      )}

      {activeKey ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Active Key</CardTitle>
                  <CardDescription>Used for REST API access</CardDescription>
                </div>
              </div>
              <Badge variant="secondary">Active</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono">
                {activeKey.keyPreview}
              </code>
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(activeKey.keyPreview)} title="Copy preview">
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Created {new Date(activeKey.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span>Last used: {activeKey.lastUsed ? new Date(activeKey.lastUsed).toLocaleDateString() : "Never"}</span>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={rollKey} disabled={acting}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Roll key
              </Button>
              {!confirmDelete ? (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Are you sure?
                  </span>
                  <Button variant="destructive" size="sm" onClick={deleteKey} disabled={acting}>
                    Yes, delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Key className="h-10 w-10 text-muted-foreground/40" />
            <div className="text-center">
              <p className="font-medium">No API key yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create one to use the REST API. MCP and CLI use website OAuth.</p>
            </div>
            <Button onClick={createKey} disabled={acting}>
              {acting ? "Creating..." : "Create API Key"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How to use your key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p><strong>MCP Server URL:</strong></p>
          <code className="block rounded bg-muted px-3 py-2 text-xs font-mono break-all">
            https://deepsyte-api-production.up.railway.app/mcp
          </code>
          <p><strong>MCP/CLI:</strong> Use website OAuth from the Install page or run <code className="bg-muted px-1 rounded">deepsyte login</code>.</p>
          <p><strong>REST API:</strong> Pass as <code className="bg-muted px-1 rounded">Authorization: Bearer sk_live_...</code> header</p>
          <p><strong>Playground:</strong> Your key is automatically loaded — just go to Playground and start capturing.</p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
