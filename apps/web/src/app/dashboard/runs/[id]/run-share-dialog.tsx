"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Copy, Globe, Loader2, RefreshCcw, Share2, Trash2 } from "lucide-react";

type ShareResponse = {
  shareToken: string | null;
  shareUrl: string | null;
  sharedAt: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function RunShareDialog({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareResponse>({
    shareToken: null,
    shareUrl: null,
    sharedAt: null,
  });

  const loadShareState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/share`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load share settings");
      setShare(data as ShareResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load share settings");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (!open) return;
    void loadShareState();
  }, [loadShareState, open]);

  async function createShare(regenerate = false) {
    setSubmitting(true);
    setError(null);
    setCopyState("idle");
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create share URL");
      setShare(data as ShareResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share URL");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeShare() {
    setSubmitting(true);
    setError(null);
    setCopyState("idle");
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/share`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to revoke share URL");
      setShare({ shareToken: null, shareUrl: null, sharedAt: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke share URL");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyShareUrl() {
    if (!share.shareUrl) return;
    try {
      await navigator.clipboard.writeText(share.shareUrl);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Share2 className="mr-2 h-4 w-4" />
        Share run
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share run by URL</DialogTitle>
          <DialogDescription>
            Create a read-only public link for this run so teammates can review the outcome, evidence, and key diagnostics without dashboard access.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={share.shareUrl ? "secondary" : "outline"}>
                {share.shareUrl ? "Shared" : "Not shared"}
              </Badge>
              {share.sharedAt && <span className="text-xs text-muted-foreground">Last updated {formatDate(share.sharedAt)}</span>}
            </div>
            <p className="text-sm text-muted-foreground">
              Anyone with the URL can open a read-only run review page. Revoke the link at any time to disable access.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading share settings…
            </div>
          ) : share.shareUrl ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label>Shareable URL</Label>
                <Input value={share.shareUrl} readOnly />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void copyShareUrl()}>
                  <Copy className="mr-2 h-4 w-4" />
                  {copyState === "copied" ? "Copied" : "Copy link"}
                </Button>
                <Link
                  href={share.shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Open shared page
                </Link>
                <Button type="button" variant="outline" disabled={submitting} onClick={() => void createShare(true)}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Regenerate
                </Button>
                <Button type="button" variant="outline" disabled={submitting} onClick={() => void revokeShare()}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Revoke
                </Button>
              </div>
              {copyState === "error" && <p className="text-xs text-destructive">Could not copy the URL automatically.</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed p-6">
              <p className="text-sm text-muted-foreground">
                This run does not have a public share URL yet.
              </p>
              <Button type="button" disabled={submitting} onClick={() => void createShare(false)}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
                Create share URL
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
