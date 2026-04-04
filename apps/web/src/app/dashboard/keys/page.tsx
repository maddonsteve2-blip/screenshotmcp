"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Copy, Check } from "lucide-react";
import type { ApiKey } from "@screenshotsmcp/types";

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  async function fetchKeys() {
    const res = await fetch("/api/keys");
    const data = await res.json();
    setKeys(data.keys ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchKeys(); }, []);

  async function createKey() {
    if (!name.trim()) return;
    setCreating(true);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setNewKey(data.key);
    setName("");
    setCreating(false);
    fetchKeys();
  }

  async function revokeKey(id: string) {
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    fetchKeys();
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">Manage your API keys for REST and MCP access</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setNewKey(null); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>Give your key a name to identify it later.</DialogDescription>
            </DialogHeader>
            {!newKey ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Key name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Production, Claude Desktop"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createKey()}
                  />
                </div>
                <Button onClick={createKey} disabled={creating || !name.trim()} className="w-full">
                  {creating ? "Creating..." : "Create key"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Copy this key now — it won&apos;t be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                    {newKey}
                  </code>
                  <Button size="icon" variant="outline" onClick={copyKey}>
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Button variant="outline" className="w-full" onClick={() => { setOpen(false); setNewKey(null); }}>
                  Done
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
          <CardDescription>Keys are hashed — only the prefix is stored.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No keys yet. Create one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-0.5 rounded">{k.keyPreview}</code>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {k.lastUsed ? new Date(k.lastUsed).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.revoked ? "destructive" : "secondary"}>
                        {k.revoked ? "Revoked" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {!k.revoked && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => revokeKey(k.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
