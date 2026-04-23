"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  MonitorSmartphone,
  Tablet,
  Monitor,
  Moon,
  FileText,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { PageContainer } from "@/components/page-container";
import { apiFetch } from "@/lib/api-fetch";
import { watchScreenshot } from "./watch-screenshot";

type Device = { label: string; width: number; height: number; icon: React.ElementType };
type Format = "png" | "jpeg" | "webp" | "pdf";
type Tab = "single" | "diff" | "batch";

const DEVICES: Device[] = [
  { label: "Desktop", width: 1280, height: 800, icon: Monitor },
  { label: "Tablet", width: 820, height: 1180, icon: Tablet },
  { label: "Mobile", width: 393, height: 852, icon: MonitorSmartphone },
];

const FORMATS: { value: Format; label: string }[] = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
  { value: "pdf", label: "PDF" },
];

// Playground proxies through Next.js API routes — no API key needed (auth via Clerk session).
// The result arrives via a dedicated `screenshot-live` WebSocket; no polling.
async function captureScreenshot(params: {
  url: string;
  width: number;
  height: number;
  fullPage: boolean;
  dark: boolean;
  format: Format;
}): Promise<{ publicUrl: string; width: number; height: number; format: string; elapsed: string } | { error: string }> {
  const res = await apiFetch("/api/playground/screenshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: params.url,
      width: params.width,
      height: params.height,
      fullPage: params.fullPage,
      format: params.format === "pdf" ? "png" : params.format,
      pdf: params.format === "pdf",
      darkMode: params.dark,
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    return { error: e.error ?? `HTTP ${res.status}` };
  }

  const job = await res.json();
  const jobId: string = job.id ?? job.jobId;
  if (!jobId) return { error: "API did not return a job ID" };

  return watchScreenshot(jobId, {
    width: params.width,
    height: params.height,
    format: params.format,
  });
}

export default function PlaygroundPage() {
  const [tab, setTab] = useState<Tab>("single");

  // Single
  const [url, setUrl] = useState("");
  const [device, setDevice] = useState(DEVICES[0]);
  const [format, setFormat] = useState<Format>("png");
  const [fullPage, setFullPage] = useState(false);
  const [dark, setDark] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ publicUrl: string; width: number; height: number; format: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Diff
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [diffResult, setDiffResult] = useState<{ diffUrl: string; changedPixels: number; matchScore: number } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Batch
  const [batchUrls, setBatchUrls] = useState("");
  const [batchResults, setBatchResults] = useState<Array<{ url: string; publicUrl?: string; error?: string }>>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  async function handleCapture() {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    const r = await captureScreenshot({ url: url.trim(), width: device.width, height: device.height, fullPage, dark, format });
    if ("error" in r) setError(r.error);
    else setResult(r);
    setLoading(false);
  }

  async function handleDiff() {
    if (!urlA.trim() || !urlB.trim()) return;
    setDiffLoading(true);
    setDiffResult(null);
    setDiffError(null);
    try {
      const res = await apiFetch("/api/playground/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlA.trim(), width: device.width, height: device.height }),
      });
      // Note: diff is not yet supported via REST — capture both individually
      // TODO: add diff proxy route
      if (!res.ok) { const e = await res.json().catch(() => ({})); setDiffError(e.error ?? `HTTP ${res.status}`); }
      else setDiffResult(await res.json());
    } catch (e) {
      setDiffError(String(e));
    }
    setDiffLoading(false);
  }

  async function handleBatch() {
    const urls = batchUrls.split("\n").map((u) => u.trim()).filter(Boolean).slice(0, 10);
    if (!urls.length) return;
    setBatchLoading(true);
    setBatchResults(urls.map((u) => ({ url: u })));
    const results = await Promise.all(urls.map(async (u) => {
      const r = await captureScreenshot({ url: u, width: device.width, height: device.height, fullPage: false, dark: false, format: "png" });
      return "error" in r ? { url: u, error: r.error } : { url: u, publicUrl: r.publicUrl };
    }));
    setBatchResults(results);
    setBatchLoading(false);
  }

  async function copyUrl(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <PageContainer width="data" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Playground</h1>
        <p className="text-muted-foreground mt-1">Capture screenshots interactively — no code required</p>
      </div>


      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {(["single", "diff", "batch"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "single" ? "Single" : t === "diff" ? "Visual Diff" : "Batch"}
          </button>
        ))}
      </div>

      {/* Single Tab */}
      {tab === "single" && (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Form column */}
          <Card className="h-fit lg:sticky lg:top-6">
            <CardContent className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">URL</label>
                <Input
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCapture()}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Device</label>
                <div className="grid grid-cols-3 gap-1">
                  {DEVICES.map((d) => (
                    <button
                      key={d.label}
                      onClick={() => setDevice(d)}
                      className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-sm border transition-colors ${
                        device.label === d.label ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <d.icon className="h-3.5 w-3.5" />
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Format</label>
                <div className="grid grid-cols-4 gap-1">
                  {FORMATS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFormat(f.value)}
                      className={`px-2 py-1.5 rounded-md text-sm border transition-colors ${
                        format === f.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={fullPage} onChange={(e) => setFullPage(e.target.checked)} className="rounded" />
                  Full page
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} className="rounded" />
                  <Moon className="h-3.5 w-3.5" /> Dark mode
                </label>
              </div>

              <Button onClick={handleCapture} disabled={loading || !url.trim()} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                {loading ? "Capturing…" : "Capture"}
              </Button>
            </CardContent>
          </Card>

          {/* Preview column */}
          <div className="flex flex-col gap-4">
            {loading && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-32 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Capturing screenshot…</p>
                </CardContent>
              </Card>
            )}

            {error && (
              <Card className="border-destructive/50">
                <CardContent className="flex items-center gap-3 py-4 text-destructive">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p className="text-sm">{error}</p>
                </CardContent>
              </Card>
            )}

            {result && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Result</CardTitle>
                    <div className="flex gap-2">
                      <Badge variant="secondary">
                        {result.publicUrl.endsWith(".pdf") ? "PDF" : `${result.width}×${result.height} ${result.format.toUpperCase()}`}
                      </Badge>
                      <Badge variant="outline">{device.label}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.publicUrl.endsWith(".pdf") ? (
                    <div className="flex items-center justify-center h-48 bg-muted rounded-lg gap-2">
                      <FileText className="h-10 w-10 text-muted-foreground/50" />
                      <span className="text-sm text-muted-foreground">PDF Document</span>
                    </div>
                  ) : (
                    <img src={result.publicUrl} alt={url} className="w-full rounded-lg border shadow-sm" />
                  )}
                  <div className="flex items-center gap-2">
                    <Input value={result.publicUrl} readOnly className="font-mono text-xs" />
                    <Button variant="outline" size="sm" onClick={() => copyUrl(result.publicUrl)}>
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <a href={result.publicUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            )}

            {!loading && !error && !result && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-32 gap-2 text-center">
                  <Camera className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Enter a URL and hit Capture to see the result here.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Diff Tab */}
      {tab === "diff" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visual Diff</CardTitle>
              <CardDescription>Compare two pages pixel-by-pixel and see exactly what changed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <Input placeholder="URL A (before)" value={urlA} onChange={(e) => setUrlA(e.target.value)} />
                <Input placeholder="URL B (after)" value={urlB} onChange={(e) => setUrlB(e.target.value)} />
              </div>
              <div className="flex gap-1">
                {DEVICES.map((d) => (
                  <button
                    key={d.label}
                    onClick={() => setDevice(d)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      device.label === d.label ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <d.icon className="h-3.5 w-3.5" />
                    {d.label}
                  </button>
                ))}
              </div>
              <Button onClick={handleDiff} disabled={diffLoading || !urlA.trim() || !urlB.trim()}>
                {diffLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Compare
              </Button>
            </CardContent>
          </Card>

          {diffError && (
            <Card className="border-destructive/50">
              <CardContent className="flex items-center gap-3 py-4 text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm">{diffError}</p>
              </CardContent>
            </Card>
          )}

          {diffResult && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Diff Result</CardTitle>
                  <div className="flex gap-2">
                    <Badge variant={diffResult.matchScore > 95 ? "secondary" : "destructive"}>
                      {diffResult.matchScore.toFixed(1)}% match
                    </Badge>
                    <Badge variant="outline">{diffResult.changedPixels.toLocaleString()} px changed</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <img src={diffResult.diffUrl} alt="Visual diff" className="w-full rounded-lg border shadow-sm" />
                <div className="flex items-center gap-2">
                  <Input value={diffResult.diffUrl} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="sm" onClick={() => copyUrl(diffResult.diffUrl)}>
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Batch Tab */}
      {tab === "batch" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Batch Capture</CardTitle>
              <CardDescription>Capture up to 10 URLs in parallel. One URL per line.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="w-full min-h-32 rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={"https://example.com\nhttps://github.com\nhttps://vercel.com"}
                value={batchUrls}
                onChange={(e) => setBatchUrls(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {batchUrls.split("\n").filter((u) => u.trim()).length} URLs
                  {batchUrls.split("\n").filter((u) => u.trim()).length > 10 ? " (max 10)" : ""}
                </span>
                <Button onClick={handleBatch} disabled={batchLoading || !batchUrls.trim()}>
                  {batchLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                  Capture All
                </Button>
              </div>
            </CardContent>
          </Card>

          {batchResults.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {batchResults.map((r, i) => (
                <Card key={i} className="overflow-hidden">
                  <div className="h-32 bg-muted overflow-hidden relative">
                    {r.publicUrl ? (
                      <img src={r.publicUrl} alt={r.url} className="w-full h-full object-cover object-top" loading="lazy" />
                    ) : r.error ? (
                      <div className="flex flex-col items-center justify-center h-full gap-1">
                        <AlertCircle className="h-5 w-5 text-destructive/50" />
                        <span className="text-xs text-destructive/70 px-2 text-center">{r.error}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-2">
                    <p className="text-xs text-muted-foreground truncate" title={r.url}>{r.url}</p>
                    {r.publicUrl && (
                      <div className="flex gap-1 mt-1">
                        <a href={r.publicUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                          <Button variant="outline" size="sm" className="w-full h-6 text-xs">
                            <ExternalLink className="h-3 w-3 mr-1" />View
                          </Button>
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
